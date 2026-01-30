import path from 'path'
import { execa } from 'execa'
import { GitWorktreeManager } from '../lib/GitWorktreeManager.js'
import { IdentifierParser } from '../utils/IdentifierParser.js'
import { isIdeAvailable, getInstallHint } from '../utils/ide.js'
import { extractIssueNumber } from '../utils/git.js'
import { logger } from '../utils/logger.js'
import { waitForKeypress } from '../utils/prompt.js'
import type { GitWorktree } from '../types/worktree.js'
import type { ParsedInput } from './start.js'

export interface VSCodeCommandInput {
	identifier?: string | undefined
	wait?: boolean | undefined
}

interface ParsedVSCodeInput extends ParsedInput {
	autoDetected: boolean
}

const EXTENSION_ID = 'iloom-ai.iloom-vscode'
const VSCODE_COMMAND = 'code'

export class VSCodeCommand {
	private gitWorktreeManager: GitWorktreeManager
	private identifierParser: IdentifierParser

	constructor(gitWorktreeManager?: GitWorktreeManager, identifierParser?: IdentifierParser) {
		this.gitWorktreeManager = gitWorktreeManager ?? new GitWorktreeManager()
		this.identifierParser = identifierParser ?? new IdentifierParser(this.gitWorktreeManager)
	}

	async execute(input: VSCodeCommandInput): Promise<void> {
		// 1. Check VS Code CLI available
		const available = await isIdeAvailable(VSCODE_COMMAND)
		if (!available) {
			throw new Error(
				`VS Code CLI is not available. The "${VSCODE_COMMAND}" command was not found in PATH.\n` +
					getInstallHint('vscode')
			)
		}

		// 2. Parse or auto-detect identifier
		const parsed = input.identifier
			? await this.parseExplicitInput(input.identifier)
			: await this.autoDetectFromCurrentDirectory()

		logger.debug(`Parsed input: ${JSON.stringify(parsed)}`)

		// 3. Find worktree path based on identifier
		const worktree = await this.findWorktreeForIdentifier(parsed)

		logger.info(`Found worktree at: ${worktree.path}`)

		// 4. Check if extension is already installed
		const installedExtensions = await execa(VSCODE_COMMAND, ['--list-extensions'])
		const extensionList = installedExtensions.stdout.split('\n').map(ext => ext.trim().toLowerCase())
		const isExtensionInstalled = extensionList.includes(EXTENSION_ID.toLowerCase())

		// 5. Install extension if not already installed
		const lightbulb = '\u{1F4A1}'
		if (isExtensionInstalled) {
			logger.info('iloom VS Code extension is already installed')
		} else {
			logger.info('Installing iloom VS Code extension...')
			await execa(VSCODE_COMMAND, ['--install-extension', EXTENSION_ID])
			logger.success('Extension installed!')
		}

		// 6. Wait for keypress then open VS Code (skip if wait is false)
		if (input.wait !== false) {
			await waitForKeypress(`Press any key to open VS Code (look for the ${lightbulb} icon in the activity bar)...`)
		}
		await execa(VSCODE_COMMAND, [worktree.path])
	}

	/**
	 * Parse explicit identifier input
	 */
	private async parseExplicitInput(identifier: string): Promise<ParsedVSCodeInput> {
		const parsed = await this.identifierParser.parseForPatternDetection(identifier)

		// Description type should never reach vscode command
		if (parsed.type === 'description') {
			throw new Error('Description input type is not supported in vscode command')
		}

		return { ...parsed, autoDetected: false }
	}

	/**
	 * Auto-detect identifier from current directory
	 */
	private async autoDetectFromCurrentDirectory(): Promise<ParsedVSCodeInput> {
		const currentDir = path.basename(process.cwd())

		// Check for PR worktree pattern: _pr_N suffix
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

		// Check for issue pattern in directory
		const issueNumber = extractIssueNumber(currentDir)

		if (issueNumber !== null) {
			logger.debug(`Auto-detected issue #${issueNumber} from directory: ${currentDir}`)
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
		const branchIssueNumber = extractIssueNumber(currentBranch)
		if (branchIssueNumber !== null) {
			logger.debug(`Auto-detected issue #${branchIssueNumber} from branch: ${currentBranch}`)
			return {
				type: 'issue',
				number: branchIssueNumber,
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
	 * Find worktree for the given identifier
	 */
	private async findWorktreeForIdentifier(parsed: ParsedVSCodeInput): Promise<GitWorktree> {
		let worktree: GitWorktree | null = null

		if (parsed.type === 'issue' && parsed.number !== undefined) {
			worktree = await this.gitWorktreeManager.findWorktreeForIssue(parsed.number)
		} else if (parsed.type === 'pr' && parsed.number !== undefined) {
			const prNumber = typeof parsed.number === 'number' ? parsed.number : Number(parsed.number)
			if (isNaN(prNumber) || !isFinite(prNumber)) {
				throw new Error(`Invalid PR number: ${parsed.number}. PR numbers must be numeric.`)
			}
			worktree = await this.gitWorktreeManager.findWorktreeForPR(prNumber, '')
		} else if (parsed.type === 'branch' && parsed.branchName) {
			worktree = await this.gitWorktreeManager.findWorktreeForBranch(parsed.branchName)
		}

		if (!worktree) {
			throw new Error(
				`No worktree found for ${this.formatParsedInput(parsed)}. ` +
					`Run 'il start ${parsed.originalInput}' to create one.`
			)
		}

		return worktree
	}

	/**
	 * Format parsed input for display
	 */
	private formatParsedInput(parsed: ParsedVSCodeInput): string {
		const autoLabel = parsed.autoDetected ? ' (auto-detected)' : ''

		if (parsed.type === 'issue') {
			return `issue #${parsed.number}${autoLabel}`
		}
		if (parsed.type === 'pr') {
			return `PR #${parsed.number}${autoLabel}`
		}
		return `branch "${parsed.branchName}"${autoLabel}`
	}
}
