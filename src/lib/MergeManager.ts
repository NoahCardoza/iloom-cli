import { executeGitCommand, findMainWorktreePath } from '../utils/git.js'
import { logger } from '../utils/logger.js'
import type { MergeOptions } from '../types/index.js'

/**
 * MergeManager handles Git rebase and fast-forward merge operations
 * Implements fail-fast behavior for conflicts (Phase 1 - no Claude assistance)
 *
 * Ports bash/merge-and-clean.sh lines 781-1090
 */
export class MergeManager {
	/**
	 * Rebase current branch on main with fail-fast on conflicts
	 * Ports bash/merge-and-clean.sh lines 781-913
	 *
	 * @param worktreePath - Path to the worktree
	 * @param options - Merge options (dryRun, force)
	 * @throws Error if main branch doesn't exist, uncommitted changes exist, or conflicts occur
	 */
	async rebaseOnMain(worktreePath: string, options: MergeOptions = {}): Promise<void> {
		const { dryRun = false, force = false } = options

		logger.info('Starting rebase on main branch...')

		// Step 1: Check if main branch exists
		try {
			await executeGitCommand(['show-ref', '--verify', '--quiet', 'refs/heads/main'], {
				cwd: worktreePath,
			})
		} catch {
			throw new Error(
				'Main branch does not exist. Cannot rebase.\n' +
					'Ensure the repository has a "main" branch or create it first.'
			)
		}

		// Step 2: Check for uncommitted changes (defensive check)
		const statusOutput = await executeGitCommand(['status', '--porcelain'], {
			cwd: worktreePath,
		})

		if (statusOutput.trim()) {
			throw new Error(
				'Uncommitted changes detected. Please commit or stash changes before rebasing.\n' +
					'Run: git status to see uncommitted changes\n' +
					'Or: hb finish will automatically commit them for you'
			)
		}

		// Step 3: Show commits to be rebased
		const commitsOutput = await executeGitCommand(['log', '--oneline', 'main..HEAD'], {
			cwd: worktreePath,
		})

		const commits = commitsOutput.trim()

		// If no commits, branch is already up to date
		if (!commits) {
			logger.success('Branch is already up to date with main. No rebase needed.')
			return
		}

		// Show commits that will be rebased
		const commitLines = commits.split('\n')
		logger.info(`Found ${commitLines.length} commit(s) to rebase:`)
		commitLines.forEach((commit) => logger.info(`  ${commit}`))

		// Step 4: User confirmation (unless force mode or dry-run)
		if (!force && !dryRun) {
			// TODO: Implement interactive prompt for confirmation
			// For now, proceeding automatically (use --force to skip this message)
			logger.info('Proceeding with rebase... (use --force to skip confirmations)')
		}

		// Step 5: Execute rebase (unless dry-run)
		if (dryRun) {
			logger.info('[DRY RUN] Would execute: git rebase main')
			logger.info(`[DRY RUN] This would rebase ${commitLines.length} commit(s)`)
			return
		}

		// Execute rebase
		try {
			await executeGitCommand(['rebase', 'main'], { cwd: worktreePath })
			logger.success('Rebase completed successfully!')
		} catch (error) {
			// Detect conflicts
			const conflictedFiles = await this.detectConflictedFiles(worktreePath)

			if (conflictedFiles.length > 0) {
				// Format conflict error with manual resolution instructions
				const conflictError = this.formatConflictError(conflictedFiles)
				throw new Error(conflictError)
			}

			// If not a conflict, re-throw the original error
			throw new Error(
				`Rebase failed: ${error instanceof Error ? error.message : String(error)}\n` +
					'Run: git status for more details\n' +
					'Or: git rebase --abort to cancel the rebase'
			)
		}
	}

	/**
	 * Validate that fast-forward merge is possible
	 * Ports bash/merge-and-clean.sh lines 957-968
	 *
	 * @param branchName - Name of the branch to merge
	 * @param mainWorktreePath - Path where main branch is checked out
	 * @throws Error if fast-forward is not possible
	 */
	async validateFastForwardPossible(branchName: string, mainWorktreePath: string): Promise<void> {
		// Step 1: Get merge-base between main and branch
		const mergeBase = await executeGitCommand(['merge-base', 'main', branchName], {
			cwd: mainWorktreePath,
		})

		// Step 2: Get current HEAD of main
		const mainHead = await executeGitCommand(['rev-parse', 'main'], {
			cwd: mainWorktreePath,
		})

		// Step 3: Compare - they must match for fast-forward
		const mergeBaseTrimmed = mergeBase.trim()
		const mainHeadTrimmed = mainHead.trim()

		if (mergeBaseTrimmed !== mainHeadTrimmed) {
			throw new Error(
				'Cannot perform fast-forward merge.\n' +
					'The main branch has moved forward since this branch was created.\n' +
					`Merge base: ${mergeBaseTrimmed}\n` +
					`Main HEAD:  ${mainHeadTrimmed}\n\n` +
					'To fix this:\n' +
					`  1. Rebase the branch on main: git rebase main\n` +
					`  2. Or use: hb finish to automatically rebase and merge\n`
			)
		}
	}

	/**
	 * Perform fast-forward only merge
	 * Ports bash/merge-and-clean.sh lines 938-994
	 *
	 * @param branchName - Name of the branch to merge
	 * @param worktreePath - Path to the worktree
	 * @param options - Merge options (dryRun, force)
	 * @throws Error if checkout, validation, or merge fails
	 */
	async performFastForwardMerge(
		branchName: string,
		worktreePath: string,
		options: MergeOptions = {}
	): Promise<void> {
		const { dryRun = false, force = false } = options

		logger.info('Starting fast-forward merge...')

		// Step 1: Find where main branch is checked out
		// This copies the bash script approach: find main worktree, run commands from there
		const mainWorktreePath = options.repoRoot ?? await findMainWorktreePath(worktreePath)

		// Step 2: No need to checkout main - it's already checked out in mainWorktreePath
		logger.debug(`Using main branch location: ${mainWorktreePath}`)

		// Step 3: Verify on main branch
		const currentBranch = await executeGitCommand(['branch', '--show-current'], {
			cwd: mainWorktreePath,
		})

		if (currentBranch.trim() !== 'main') {
			throw new Error(
				`Expected main branch but found: ${currentBranch.trim()}\n` +
					`At location: ${mainWorktreePath}\n` +
					'This indicates the main worktree detection failed.'
			)
		}

		// Step 4: Validate fast-forward is possible
		await this.validateFastForwardPossible(branchName, mainWorktreePath)

		// Step 5: Show commits to be merged
		const commitsOutput = await executeGitCommand(['log', '--oneline', `main..${branchName}`], {
			cwd: mainWorktreePath,
		})

		const commits = commitsOutput.trim()

		// If no commits, branch is already merged
		if (!commits) {
			logger.success('Branch is already merged into main. No merge needed.')
			return
		}

		// Show commits that will be merged
		const commitLines = commits.split('\n')
		logger.info(`Found ${commitLines.length} commit(s) to merge:`)
		commitLines.forEach((commit) => logger.info(`  ${commit}`))

		// Step 6: User confirmation (unless force mode or dry-run)
		if (!force && !dryRun) {
			// TODO: Implement interactive prompt for confirmation
			// For now, proceeding automatically (use --force to skip this message)
			logger.info('Proceeding with fast-forward merge... (use --force to skip confirmations)')
		}

		// Step 7: Execute merge (unless dry-run)
		if (dryRun) {
			logger.info(`[DRY RUN] Would execute: git merge --ff-only ${branchName}`)
			logger.info(`[DRY RUN] This would merge ${commitLines.length} commit(s)`)
			return
		}

		// Execute fast-forward merge
		try {
			await executeGitCommand(['merge', '--ff-only', branchName], { cwd: mainWorktreePath })
			logger.success(`Fast-forward merge completed! Merged ${commitLines.length} commit(s).`)
		} catch (error) {
			throw new Error(
				`Fast-forward merge failed: ${error instanceof Error ? error.message : String(error)}\n\n` +
					'To recover:\n' +
					'  1. Check merge status: git status\n' +
					'  2. Abort merge if needed: git merge --abort\n' +
					'  3. Verify branch is rebased: git rebase main\n' +
					'  4. Try merge again: hb finish'
			)
		}
	}

	/**
	 * Helper: Detect conflicted files after failed rebase
	 * @private
	 */
	private async detectConflictedFiles(worktreePath: string): Promise<string[]> {
		try {
			const output = await executeGitCommand(['diff', '--name-only', '--diff-filter=U'], {
				cwd: worktreePath,
			})

			return output
				.trim()
				.split('\n')
				.filter((file) => file.length > 0)
		} catch {
			// If command fails, return empty array (might not be a conflict)
			return []
		}
	}

	/**
	 * Helper: Format conflict error message with manual resolution steps
	 * @private
	 */
	private formatConflictError(conflictedFiles: string[]): string {
		const fileList = conflictedFiles.map((file) => `  • ${file}`).join('\n')

		return (
			'Rebase failed - merge conflicts detected in:\n' +
			fileList +
			'\n\n' +
			'To resolve manually:\n' +
			'  1. Fix conflicts in the files above\n' +
			'  2. Stage resolved files: git add <files>\n' +
			'  3. Continue rebase: git rebase --continue\n' +
			'  4. Or abort rebase: git rebase --abort\n' +
			'  5. Then re-run: hb finish <issue-number>'
		)
	}
}
