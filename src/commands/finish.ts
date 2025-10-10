import { logger } from '../utils/logger.js'
import { GitHubService } from '../lib/GitHubService.js'
import { GitWorktreeManager } from '../lib/GitWorktreeManager.js'
import { ValidationRunner } from '../lib/ValidationRunner.js'
import { CommitManager } from '../lib/CommitManager.js'
import { MergeManager } from '../lib/MergeManager.js'
import { IdentifierParser } from '../utils/IdentifierParser.js'
import type { FinishOptions, GitWorktree, CommitOptions, MergeOptions } from '../types/index.js'
import path from 'path'

export interface FinishCommandInput {
	identifier?: string | undefined // Optional - can be auto-detected
	options: FinishOptions
}

export interface ParsedFinishInput {
	type: 'issue' | 'pr' | 'branch'
	number?: number // For issues and PRs
	branchName?: string // For branch inputs
	originalInput: string // Raw input for error messages
	autoDetected?: boolean // True if detected from current directory
}

export class FinishCommand {
	private gitHubService: GitHubService
	private gitWorktreeManager: GitWorktreeManager
	private validationRunner: ValidationRunner
	private commitManager: CommitManager
	private mergeManager: MergeManager
	private identifierParser: IdentifierParser

	constructor(
		gitHubService?: GitHubService,
		gitWorktreeManager?: GitWorktreeManager,
		validationRunner?: ValidationRunner,
		commitManager?: CommitManager,
		mergeManager?: MergeManager,
		identifierParser?: IdentifierParser
	) {
		// Dependency injection for testing
		this.gitHubService = gitHubService ?? new GitHubService()
		this.gitWorktreeManager = gitWorktreeManager ?? new GitWorktreeManager()
		this.validationRunner = validationRunner ?? new ValidationRunner()
		this.commitManager = commitManager ?? new CommitManager()
		this.mergeManager = mergeManager ?? new MergeManager()
		this.identifierParser = identifierParser ?? new IdentifierParser(this.gitWorktreeManager)
	}

	/**
	 * Main entry point for finish command
	 */
	public async execute(input: FinishCommandInput): Promise<void> {
		try {
			// Step 1: Parse input (or auto-detect from current directory)
			const parsed = await this.parseInput(input.identifier, input.options)

			// Step 2: Validate based on type and get worktrees
			const worktrees = await this.validateInput(parsed, input.options)

			// Step 3: Log success
			logger.info(`Validated input: ${this.formatParsedInput(parsed)}`)

			// Get worktree for steps 4 and 5
			const worktree = worktrees[0]
			if (!worktree) {
				throw new Error('No worktree found')
			}

			// Step 4: Run pre-merge validations FIRST (Sub-Issue #47)
			if (!input.options.dryRun) {
				logger.info('Running pre-merge validations...')

				await this.validationRunner.runValidations(worktree.path, {
					dryRun: input.options.dryRun ?? false,
				})
				logger.success('All validations passed')
			} else {
				logger.info('[DRY RUN] Would run pre-merge validations')
			}

			// Step 5: Detect uncommitted changes AFTER validation passes
			const gitStatus = await this.commitManager.detectUncommittedChanges(worktree.path)

			// Step 6: Commit changes only if validation passed AND changes exist
			if (gitStatus.hasUncommittedChanges) {
				if (input.options.dryRun) {
					logger.info('[DRY RUN] Would auto-commit uncommitted changes (validation passed)')
				} else {
					logger.info('Validation passed, auto-committing uncommitted changes...')

					const commitOptions: CommitOptions = {
						dryRun: input.options.dryRun ?? false,
					}

					// Only add issueNumber if it's an issue
					if (parsed.type === 'issue' && parsed.number) {
						commitOptions.issueNumber = parsed.number
					}

					await this.commitManager.commitChanges(worktree.path, commitOptions)

					logger.success('Changes committed successfully')
				}
			} else {
				logger.debug('No uncommitted changes found')
			}

			// Step 7: Rebase branch on main
			logger.info('Rebasing branch on main...')

			const mergeOptions: MergeOptions = {
				dryRun: input.options.dryRun ?? false,
				force: input.options.force ?? false,
			}

			await this.mergeManager.rebaseOnMain(worktree.path, mergeOptions)
			logger.success('Branch rebased successfully')

			// Step 8: Perform fast-forward merge
			logger.info('Performing fast-forward merge...')
			await this.mergeManager.performFastForwardMerge(worktree.branch, worktree.path, mergeOptions)
			logger.success('Fast-forward merge completed successfully')
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`${error.message}`)
			} else {
				logger.error('An unknown error occurred')
			}
			throw error
		}
	}

	/**
	 * Parse input to determine type and extract relevant data
	 * Supports auto-detection from current directory when identifier is undefined
	 */
	private async parseInput(
		identifier: string | undefined,
		options: FinishOptions
	): Promise<ParsedFinishInput> {
		// Priority 1: --pr flag overrides everything
		if (options.pr !== undefined) {
			return {
				type: 'pr',
				number: options.pr,
				originalInput: `--pr ${options.pr}`,
				autoDetected: false,
			}
		}

		// Priority 2: Explicit identifier provided
		if (identifier?.trim()) {
			return await this.parseExplicitInput(identifier.trim())
		}

		// Priority 3: Auto-detect from current directory
		return await this.autoDetectFromCurrentDirectory()
	}

	/**
	 * Parse explicit identifier input using pattern-based detection
	 * (No GitHub API calls - uses IdentifierParser)
	 */
	private async parseExplicitInput(
		identifier: string
	): Promise<ParsedFinishInput> {
		// Check for PR-specific formats: pr/123, PR-123, PR/123
		const prPattern = /^(?:pr|PR)[/-](\d+)$/
		const prMatch = identifier.match(prPattern)
		if (prMatch?.[1]) {
			return {
				type: 'pr',
				number: parseInt(prMatch[1], 10),
				originalInput: identifier,
				autoDetected: false,
			}
		}

		// Use IdentifierParser for pattern-based detection
		// (checks existing worktrees, no GitHub API calls)
		const parsed = await this.identifierParser.parseForPatternDetection(identifier)

		// Convert ParsedInput to ParsedFinishInput (add autoDetected field)
		const result: ParsedFinishInput = {
			type: parsed.type,
			originalInput: parsed.originalInput,
			autoDetected: false,
		}

		// Add number or branchName based on type
		if (parsed.number !== undefined) {
			result.number = parsed.number
		}
		if (parsed.branchName !== undefined) {
			result.branchName = parsed.branchName
		}

		return result
	}

	/**
	 * Auto-detect PR or issue from current directory
	 * Ports logic from merge-current-issue.sh lines 30-52
	 */
	private async autoDetectFromCurrentDirectory(): Promise<ParsedFinishInput> {
		const currentDir = path.basename(process.cwd())

		// Check for PR worktree pattern: _pr_N suffix
		// Pattern: /.*_pr_(\d+)$/
		const prPattern = /_pr_(\d+)$/
		const prMatch = currentDir.match(prPattern)

		if (prMatch?.[1]) {
			const prNumber = parseInt(prMatch[1], 10)
			logger.debug(`Auto-detected PR #${prNumber} from directory: ${currentDir}`)
			return {
				type: 'pr',
				number: prNumber,
				originalInput: currentDir,
				autoDetected: true,
			}
		}

		// Check for issue pattern in directory or branch name
		// Pattern: /issue-(\d+)/
		const issuePattern = /issue-(\d+)/
		const issueMatch = currentDir.match(issuePattern)

		if (issueMatch?.[1]) {
			const issueNumber = parseInt(issueMatch[1], 10)
			logger.debug(
				`Auto-detected issue #${issueNumber} from directory: ${currentDir}`
			)
			return {
				type: 'issue',
				number: issueNumber,
				originalInput: currentDir,
				autoDetected: true,
			}
		}

		// Fallback: get current branch name
		const repoInfo = await this.gitWorktreeManager.getRepoInfo()
		const currentBranch = repoInfo.currentBranch

		if (!currentBranch) {
			throw new Error(
				'Could not auto-detect identifier. Please provide an issue number, PR number, or branch name.\n' +
					'Expected directory pattern: feat/issue-XX-description OR worktree with _pr_N suffix'
			)
		}

		// Try to extract issue from branch name
		const branchIssueMatch = currentBranch.match(issuePattern)
		if (branchIssueMatch?.[1]) {
			const issueNumber = parseInt(branchIssueMatch[1], 10)
			logger.debug(
				`Auto-detected issue #${issueNumber} from branch: ${currentBranch}`
			)
			return {
				type: 'issue',
				number: issueNumber,
				originalInput: currentBranch,
				autoDetected: true,
			}
		}

		// Last resort: use branch name
		return {
			type: 'branch',
			branchName: currentBranch,
			originalInput: currentBranch,
			autoDetected: true,
		}
	}

	/**
	 * Validate the parsed input based on its type
	 */
	private async validateInput(
		parsed: ParsedFinishInput,
		options: FinishOptions
	): Promise<GitWorktree[]> {
		switch (parsed.type) {
			case 'pr': {
				if (!parsed.number) {
					throw new Error('Invalid PR number')
				}

				// Fetch PR from GitHub
				const pr = await this.gitHubService.fetchPR(parsed.number)

				// For PRs, we allow closed/merged state (cleanup-only mode)
				// But we still validate it exists
				logger.debug(`Validated PR #${parsed.number} (state: ${pr.state})`)

				// Find associated worktree
				return await this.findWorktreeForIdentifier(parsed)
			}

			case 'issue': {
				if (!parsed.number) {
					throw new Error('Invalid issue number')
				}

				// Fetch issue from GitHub
				const issue = await this.gitHubService.fetchIssue(parsed.number)

				// Validate issue state (warn if closed unless --force)
				if (issue.state === 'closed' && !options.force) {
					throw new Error(
						`Issue #${parsed.number} is closed. Use --force to finish anyway.`
					)
				}

				logger.debug(`Validated issue #${parsed.number} (state: ${issue.state})`)

				// Find associated worktree
				return await this.findWorktreeForIdentifier(parsed)
			}

			case 'branch': {
				if (!parsed.branchName) {
					throw new Error('Invalid branch name')
				}

				// Validate branch name format
				if (!this.isValidBranchName(parsed.branchName)) {
					throw new Error(
						'Invalid branch name. Use only letters, numbers, hyphens, underscores, and slashes'
					)
				}

				logger.debug(`Validated branch name: ${parsed.branchName}`)

				// Find associated worktree
				return await this.findWorktreeForIdentifier(parsed)
			}

			default: {
				const unknownType = parsed as { type: string }
				throw new Error(`Unknown input type: ${unknownType.type}`)
			}
		}
	}

	/**
	 * Find worktree for the given identifier using specific methods based on type
	 * (uses precise pattern matching instead of broad substring matching)
	 * Throws error if not found
	 */
	private async findWorktreeForIdentifier(
		parsed: ParsedFinishInput
	): Promise<GitWorktree[]> {
		let worktree: GitWorktree | null = null

		// Use specific finding methods based on parsed type
		switch (parsed.type) {
			case 'pr': {
				if (!parsed.number) {
					throw new Error('Invalid PR number')
				}
				// Pass empty string for branch name since we don't know it yet
				worktree = await this.gitWorktreeManager.findWorktreeForPR(
					parsed.number,
					''
				)
				break
			}

			case 'issue': {
				if (!parsed.number) {
					throw new Error('Invalid issue number')
				}
				worktree = await this.gitWorktreeManager.findWorktreeForIssue(
					parsed.number
				)
				break
			}

			case 'branch': {
				if (!parsed.branchName) {
					throw new Error('Invalid branch name')
				}
				worktree = await this.gitWorktreeManager.findWorktreeForBranch(
					parsed.branchName
				)
				break
			}

			default: {
				const unknownType = parsed as { type: string }
				throw new Error(`Unknown input type: ${unknownType.type}`)
			}
		}

		if (!worktree) {
			throw new Error(
				`No worktree found for ${this.formatParsedInput(parsed)}. ` +
					`Use 'hb list' to see available worktrees.`
			)
		}

		logger.debug(`Found worktree: ${worktree.path}`)

		return [worktree]
	}

	/**
	 * Validate branch name format
	 */
	private isValidBranchName(branch: string): boolean {
		// Pattern from bash script and StartCommand
		return /^[a-zA-Z0-9/_-]+$/.test(branch)
	}

	/**
	 * Format parsed input for display
	 */
	private formatParsedInput(parsed: ParsedFinishInput): string {
		const autoLabel = parsed.autoDetected ? ' (auto-detected)' : ''

		switch (parsed.type) {
			case 'pr':
				return `PR #${parsed.number}${autoLabel}`
			case 'issue':
				return `Issue #${parsed.number}${autoLabel}`
			case 'branch':
				return `Branch '${parsed.branchName}'${autoLabel}`
			default:
				return 'Unknown input'
		}
	}
}
