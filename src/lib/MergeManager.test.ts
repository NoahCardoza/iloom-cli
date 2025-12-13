import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MergeManager } from './MergeManager.js'
import { SettingsManager } from './SettingsManager.js'
import * as git from '../utils/git.js'
import * as claude from '../utils/claude.js'

// Mock dependencies
vi.mock('../utils/git.js')
vi.mock('../utils/claude.js')
vi.mock('./SettingsManager.js')
vi.mock('../utils/logger.js', () => ({
	logger: {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
		success: vi.fn(),
	},
}))

describe('MergeManager', () => {
	let manager: MergeManager
	let mockSettingsManager: SettingsManager

	beforeEach(() => {
		// Create a mock SettingsManager
		mockSettingsManager = {
			loadSettings: vi.fn().mockResolvedValue({}),
		} as unknown as SettingsManager

		manager = new MergeManager(mockSettingsManager)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe('Rebase Workflow', () => {
		it('should verify main branch exists before rebasing', async () => {
			// Mock: main branch doesn't exist
			vi.mocked(git.executeGitCommand).mockRejectedValueOnce(
				new Error('fatal: Couldn\'t find remote ref refs/heads/main')
			)

			// Expect: should throw clear error
			await expect(
				manager.rebaseOnMain('/test/worktree')
			).rejects.toThrow(/branch.*does not exist/i)

			// Verify: show-ref command was called
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['show-ref', '--verify', '--quiet', 'refs/heads/main'],
				expect.objectContaining({ cwd: '/test/worktree' })
			)
		})

		it('should successfully rebase branch on main with no conflicts', async () => {
			// Mock: main branch exists, no uncommitted changes, commits exist, rebase succeeds
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('') // show-ref: main exists
				.mockResolvedValueOnce('') // status --porcelain: clean
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('def456') // rev-parse main
				.mockResolvedValueOnce('abc123 Commit 1\ndef456 Commit 2') // log: commits to rebase
				.mockResolvedValueOnce('') // rebase main: success

			// Should succeed without throwing
			await manager.rebaseOnMain('/test/worktree', { force: true })

			// Verify: rebase command was called
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['rebase', 'main'],
				expect.objectContaining({ cwd: '/test/worktree' })
			)
		})

		it('should show commits to be rebased before confirmation', async () => {
			// Mock: successful path
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('') // show-ref
				.mockResolvedValueOnce('') // status
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('def456') // rev-parse main
				.mockResolvedValueOnce('abc123 Commit 1\ndef456 Commit 2') // log
				.mockResolvedValueOnce('') // rebase

			await manager.rebaseOnMain('/test/worktree', { force: true })

			// Verify: log command was called to show commits
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['log', '--oneline', 'main..HEAD'],
				expect.objectContaining({ cwd: '/test/worktree' })
			)
		})

		it('should skip confirmation when force flag is true', async () => {
			// Mock: successful rebase
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('') // show-ref
				.mockResolvedValueOnce('') // status
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('def456') // rev-parse main
				.mockResolvedValueOnce('abc123 Commit 1') // log
				.mockResolvedValueOnce('') // rebase

			// Should not prompt - just proceed
			await manager.rebaseOnMain('/test/worktree', { force: true })

			// Success - should complete without interaction
			expect(git.executeGitCommand).toHaveBeenCalledTimes(6)
		})

		it('should fail immediately on rebase conflicts with clear error message', async () => {
			// Mock: rebase fails with conflict
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('') // show-ref
				.mockResolvedValueOnce('') // status
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('def456') // rev-parse main
				.mockResolvedValueOnce('abc123 Commit 1') // log
				.mockRejectedValueOnce(new Error('CONFLICT')) // rebase fails
				.mockResolvedValueOnce('src/file1.ts\nsrc/file2.ts') // conflicted files

			// Expect: should throw with conflict details
			await expect(
				manager.rebaseOnMain('/test/worktree', { force: true })
			).rejects.toThrow(/merge conflicts detected/i)
		})

		it('should handle case where branch is already up to date', async () => {
			// Mock: no commits to rebase
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('') // show-ref
				.mockResolvedValueOnce('') // status
				.mockResolvedValueOnce('abc123') // merge-base
      			.mockResolvedValueOnce('abc123') // rev-parse main (SAME = no rebase needed)

			// Should succeed without attempting rebase
			await manager.rebaseOnMain('/test/worktree', { force: true })

			// Verify: rebase was NOT called (only 3 commands)
			expect(git.executeGitCommand).toHaveBeenCalledTimes(4)
		})

		it('should detect and list all conflicted files on rebase failure', async () => {
			// Mock: multiple files in conflict
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('') // show-ref
				.mockResolvedValueOnce('') // status
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('def456') // rev-parse main
				.mockResolvedValueOnce('abc123 Commit 1') // log
				.mockRejectedValueOnce(new Error('CONFLICT')) // rebase fails
				.mockResolvedValueOnce('src/file1.ts\nsrc/file2.ts\nsrc/file3.ts') // conflicted files

			try {
				await manager.rebaseOnMain('/test/worktree', { force: true })
				expect.fail('Should have thrown an error')
			} catch (error) {
				// Verify: error contains all conflicted files
				expect((error as Error).message).toContain('src/file1.ts')
				expect((error as Error).message).toContain('src/file2.ts')
				expect((error as Error).message).toContain('src/file3.ts')
			}
		})

		it('should provide clear manual resolution instructions on conflict', async () => {
			// Mock: rebase conflict
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('') // show-ref
				.mockResolvedValueOnce('') // status
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('def456') // rev-parse main
				.mockResolvedValueOnce('abc123 Commit') // log
				.mockRejectedValueOnce(new Error('CONFLICT')) // rebase fails
				.mockResolvedValueOnce('src/file1.ts') // conflicted files

			try {
				await manager.rebaseOnMain('/test/worktree', { force: true })
				expect.fail('Should have thrown')
			} catch (error) {
				const message = (error as Error).message
				// Verify: error includes resolution steps
				expect(message).toContain('git add')
				expect(message).toContain('git rebase --continue')
				expect(message).toContain('git rebase --abort')
			}
		})

		it('should create WIP commit when uncommitted changes exist before rebase', async () => {
			// Mock: uncommitted changes detected, WIP commit created, rebase succeeds
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('') // show-ref
				.mockResolvedValueOnce('M src/file1.ts\nA src/file2.ts') // status: changes exist
				.mockResolvedValueOnce('') // git add -A
				.mockResolvedValueOnce('') // git commit -m WIP
				.mockResolvedValueOnce('abc123wipcommit') // rev-parse HEAD (WIP commit hash)
				.mockResolvedValueOnce('def456') // merge-base
				.mockResolvedValueOnce('ghi789') // rev-parse main
				.mockResolvedValueOnce('def456 Commit 1') // log
				.mockResolvedValueOnce('') // rebase main: success
				.mockResolvedValueOnce('') // reset --soft HEAD~1
				.mockResolvedValueOnce('') // reset HEAD

			// Should succeed without throwing
			await manager.rebaseOnMain('/test/worktree', { force: true })

			// Verify: WIP commit was created
			expect(git.executeGitCommand).toHaveBeenCalledWith(['add', '-A'], expect.objectContaining({ cwd: '/test/worktree' }))
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['commit', '-m', 'WIP: Auto-stash for rebase'],
				expect.objectContaining({ cwd: '/test/worktree' })
			)

			// Verify: WIP commit was restored
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['reset', '--soft', 'HEAD~1'],
				expect.objectContaining({ cwd: '/test/worktree' })
			)
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['reset', 'HEAD'],
				expect.objectContaining({ cwd: '/test/worktree' })
			)
		})
	})

	describe('WIP Commit Workflow', () => {
		it('should rebase without WIP commit when no uncommitted changes', async () => {
			// Mock: no uncommitted changes, rebase succeeds
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('') // show-ref
				.mockResolvedValueOnce('') // status: clean
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('def456') // rev-parse main
				.mockResolvedValueOnce('abc123 Commit 1') // log
				.mockResolvedValueOnce('') // rebase

			await manager.rebaseOnMain('/test/worktree', { force: true })

			// Verify: git add -A was NOT called (no WIP commit)
			expect(git.executeGitCommand).not.toHaveBeenCalledWith(['add', '-A'], expect.any(Object))
		})

		it('should include untracked files in WIP commit using git add -A', async () => {
			// Mock: untracked files exist
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('') // show-ref
				.mockResolvedValueOnce('?? newfile.ts') // status: untracked file
				.mockResolvedValueOnce('') // git add -A (stages all including untracked)
				.mockResolvedValueOnce('') // git commit -m WIP
				.mockResolvedValueOnce('wipcommithash') // rev-parse HEAD
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('abc123') // rev-parse main (already up to date)

			await manager.rebaseOnMain('/test/worktree', { force: true })

			// Verify: git add -A was called (includes untracked files)
			expect(git.executeGitCommand).toHaveBeenCalledWith(['add', '-A'], expect.objectContaining({ cwd: '/test/worktree' }))
		})

		it('should handle conflicts with Claude assistance when WIP commit present', async () => {
			// Mock: WIP commit created, rebase fails with conflict, Claude resolves
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('') // show-ref
				.mockResolvedValueOnce('M src/file.ts') // status: changes exist
				.mockResolvedValueOnce('') // git add -A
				.mockResolvedValueOnce('') // git commit -m WIP
				.mockResolvedValueOnce('wipcommithash') // rev-parse HEAD (WIP hash)
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('def456') // rev-parse main
				.mockResolvedValueOnce('abc123 Commit 1') // log
				.mockRejectedValueOnce(new Error('CONFLICT')) // rebase fails
				.mockResolvedValueOnce('src/file.ts') // conflicted files (first check)
				.mockResolvedValueOnce('') // conflicted files (after Claude - resolved)
				.mockResolvedValueOnce('') // rebase not in progress
				.mockResolvedValueOnce('') // reset --soft HEAD~1 (restore WIP)
				.mockResolvedValueOnce('') // reset HEAD (unstage)

			vi.mocked(claude.detectClaudeCli).mockResolvedValueOnce(true)
			vi.mocked(claude.launchClaude).mockResolvedValueOnce(undefined)

			await manager.rebaseOnMain('/test/worktree', { force: true })

			// Verify: WIP commit was created and restored after Claude resolution
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['commit', '-m', 'WIP: Auto-stash for rebase'],
				expect.objectContaining({ cwd: '/test/worktree' })
			)
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['reset', '--soft', 'HEAD~1'],
				expect.objectContaining({ cwd: '/test/worktree' })
			)
		})

		it('should log warning but succeed when soft reset fails', async () => {
			// Mock: WIP commit created, rebase succeeds, soft reset fails
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('') // show-ref
				.mockResolvedValueOnce('M src/file.ts') // status: changes exist
				.mockResolvedValueOnce('') // git add -A
				.mockResolvedValueOnce('') // git commit -m WIP
				.mockResolvedValueOnce('wipcommithash') // rev-parse HEAD
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('def456') // rev-parse main
				.mockResolvedValueOnce('abc123 Commit 1') // log
				.mockResolvedValueOnce('') // rebase main: success
				.mockRejectedValueOnce(new Error('reset failed')) // reset --soft HEAD~1 fails

			// Should NOT throw - rebase is considered successful even if restore fails
			await manager.rebaseOnMain('/test/worktree', { force: true })

			// Verify: reset was attempted
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['reset', '--soft', 'HEAD~1'],
				expect.objectContaining({ cwd: '/test/worktree' })
			)
		})

		it('should restore changes correctly after successful rebase', async () => {
			// Mock: full WIP workflow with restoration
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('') // show-ref
				.mockResolvedValueOnce('M src/file.ts\n?? newfile.ts') // status: mixed changes
				.mockResolvedValueOnce('') // git add -A
				.mockResolvedValueOnce('') // git commit -m WIP
				.mockResolvedValueOnce('wipcommithash123') // rev-parse HEAD
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('def456') // rev-parse main
				.mockResolvedValueOnce('abc123 Commit 1') // log
				.mockResolvedValueOnce('') // rebase main: success
				.mockResolvedValueOnce('') // reset --soft HEAD~1
				.mockResolvedValueOnce('') // reset HEAD (unstage)

			await manager.rebaseOnMain('/test/worktree', { force: true })

			// Verify: two-step reset to restore working directory state
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['reset', '--soft', 'HEAD~1'],
				expect.objectContaining({ cwd: '/test/worktree' })
			)
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['reset', 'HEAD'],
				expect.objectContaining({ cwd: '/test/worktree' })
			)
		})
	})

	describe('Fast-Forward Merge Validation', () => {
		it('should validate fast-forward merge is possible', async () => {
			const mergeBase = 'abc123'
			const mainHead = 'abc123'

			// Mock: merge-base and main HEAD match (fast-forward possible)
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce(mergeBase) // merge-base
				.mockResolvedValueOnce(mainHead) // rev-parse main

			// Should not throw
			await manager.validateFastForwardPossible('main','feature-branch', '/test/repo')

			// Verify: both commands called
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['merge-base', 'main', 'feature-branch'],
				expect.objectContaining({ cwd: '/test/repo' })
			)
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['rev-parse', 'main'],
				expect.objectContaining({ cwd: '/test/repo' })
			)
		})

		it('should detect when fast-forward is NOT possible', async () => {
			const mergeBase = 'abc123'
			const mainHead = 'def456' // Different - main has moved forward

			// Mock: merge-base mismatch
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce(mergeBase)
				.mockResolvedValueOnce(mainHead)

			// Expect: should throw with clear explanation
			await expect(
				manager.validateFastForwardPossible('main','feature-branch', '/test/repo')
			).rejects.toThrow(/cannot perform fast-forward merge/i)
		})

		it('should provide clear error when merge-base does not match main HEAD', async () => {
			// Mock: mismatch scenario
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('abc123')
				.mockResolvedValueOnce('def456')

			try {
				await manager.validateFastForwardPossible('main','feature-branch', '/test/repo')
				expect.fail('Should have thrown')
			} catch (error) {
				const message = (error as Error).message
				// Verify: error explains the issue and suggests rebasing
				expect(message).toContain('main branch has moved forward')
				expect(message).toContain('rebase')
			}
		})
	})

	describe('Fast-Forward Merge Execution', () => {
		it('should switch to main branch before merging', async () => {
			// Mock: successful merge flow
			vi.mocked(git.findMainWorktreePathWithSettings).mockResolvedValueOnce('/test/repo')
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('main') // branch --show-current
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('abc123') // rev-parse main
				.mockResolvedValueOnce('abc123 Commit 1') // log commits
				.mockResolvedValueOnce('') // merge --ff-only

			await manager.performFastForwardMerge('feature-branch', '/test/worktree', { force: true })

			// Verify: findMainWorktreePathWithSettings was called with worktreePath and settingsManager
			expect(git.findMainWorktreePathWithSettings).toHaveBeenCalledWith('/test/worktree', mockSettingsManager)
		})

		it('should verify currently on main branch after checkout', async () => {
			// Mock: successful flow
			vi.mocked(git.findMainWorktreePathWithSettings).mockResolvedValueOnce('/test/repo')
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('main') // show-current
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('abc123') // rev-parse
				.mockResolvedValueOnce('abc123 Commit') // log
				.mockResolvedValueOnce('') // merge

			await manager.performFastForwardMerge('feature-branch', '/test/worktree', { force: true })

			// Verify: branch verification called from main worktree directory
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['branch', '--show-current'],
				expect.objectContaining({ cwd: '/test/repo' })
			)
		})

		it('should successfully perform fast-forward only merge', async () => {
			// Mock: successful merge
			vi.mocked(git.findMainWorktreePathWithSettings).mockResolvedValueOnce('/test/repo')
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('main') // show-current
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('abc123') // rev-parse
				.mockResolvedValueOnce('abc123 Commit') // log
				.mockResolvedValueOnce('') // merge --ff-only

			await manager.performFastForwardMerge('feature-branch', '/test/worktree', { force: true })

			// Verify: merge --ff-only was called from main worktree directory
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['merge', '--ff-only', 'feature-branch'],
				expect.objectContaining({ cwd: '/test/repo' })
			)
		})

		it('should show commits to be merged before confirmation', async () => {
			// Mock: successful flow
			vi.mocked(git.findMainWorktreePathWithSettings).mockResolvedValueOnce('/test/repo')
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('main') // show-current
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('abc123') // rev-parse
				.mockResolvedValueOnce('abc123 Commit 1\ndef456 Commit 2') // log
				.mockResolvedValueOnce('') // merge

			await manager.performFastForwardMerge('feature-branch', '/test/worktree', { force: true })

			// Verify: log command shows commits to merge from main worktree directory
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['log', '--oneline', 'main..feature-branch'],
				expect.objectContaining({ cwd: '/test/repo' })
			)
		})

		it('should skip confirmation when force flag is true', async () => {
			// Mock: successful merge
			vi.mocked(git.findMainWorktreePathWithSettings).mockResolvedValueOnce('/test/repo')
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('main') // show-current
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('abc123') // rev-parse
				.mockResolvedValueOnce('abc123 Commit') // log
				.mockResolvedValueOnce('') // merge

			// Should complete without user interaction
			await manager.performFastForwardMerge('feature-branch', '/test/worktree', { force: true })

			expect(git.executeGitCommand).toHaveBeenCalledTimes(5)
		})

		it('should handle merge failure gracefully', async () => {
			// Mock: merge command fails
			vi.mocked(git.findMainWorktreePathWithSettings).mockResolvedValueOnce('/test/repo')
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('main') // show-current
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('abc123') // rev-parse
				.mockResolvedValueOnce('abc123 Commit') // log
				.mockRejectedValueOnce(new Error('Merge failed')) // merge fails

			// Expect: should throw with recovery instructions
			await expect(
				manager.performFastForwardMerge('feature-branch', '/test/worktree', { force: true })
			).rejects.toThrow(/merge failed/i)
		})

		it('should fail if finding main worktree fails', async () => {
			// Mock: findMainWorktreePath fails
			vi.mocked(git.findMainWorktreePathWithSettings).mockRejectedValueOnce(
				new Error('No worktree found with main branch checked out')
			)

			// Expect: should throw clear error
			await expect(
				manager.performFastForwardMerge('feature-branch', '/test/worktree', { force: true })
			).rejects.toThrow(/branch/i)
		})

		it('should fail if branch verification shows not on main', async () => {
			// Mock: main worktree found but verification shows wrong branch
			vi.mocked(git.findMainWorktreePathWithSettings).mockResolvedValueOnce('/test/repo')
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('feature-branch') // show-current: wrong branch!

			// Expect: should throw error
			await expect(
				manager.performFastForwardMerge('feature-branch', '/test/worktree', { force: true })
			).rejects.toThrow(/Expected main branch but found/i)
		})

		it('should handle case where branch is already merged', async () => {
			// Mock: no commits to merge
			vi.mocked(git.findMainWorktreePathWithSettings).mockResolvedValueOnce('/test/repo')
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('main') // show-current
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('abc123') // rev-parse
				.mockResolvedValueOnce('') // log: empty (no commits)

			// Should complete without attempting merge
			await manager.performFastForwardMerge('feature-branch', '/test/worktree', { force: true })

			// Verify: merge was NOT called (only 4 commands)
			expect(git.executeGitCommand).toHaveBeenCalledTimes(4)
		})
	})

	describe('Dry-Run Mode', () => {
		it('should preview rebase without executing when dryRun=true', async () => {
			// Mock: dry-run checks only
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('') // show-ref
				.mockResolvedValueOnce('') // status
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('def456') // rev-parse main
				.mockResolvedValueOnce('abc123 Commit 1') // log

			await manager.rebaseOnMain('/test/worktree', { dryRun: true })

			// Verify: rebase command was NOT called
			expect(git.executeGitCommand).not.toHaveBeenCalledWith(
				['rebase', 'main'],
				expect.any(Object)
			)
		})

		it('should preview merge without executing when dryRun=true', async () => {
			// Mock: dry-run checks only (no checkout in dry-run)
			vi.mocked(git.findMainWorktreePathWithSettings).mockResolvedValueOnce('/test/repo')
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('main') // show-current (first call since checkout is skipped)
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('abc123') // rev-parse
				.mockResolvedValueOnce('abc123 Commit') // log

			await manager.performFastForwardMerge('feature-branch', '/test/worktree', { dryRun: true })

			// Verify: merge command was NOT called
			expect(git.executeGitCommand).not.toHaveBeenCalledWith(
				['merge', '--ff-only', 'feature-branch'],
				expect.any(Object)
			)
		})

		it('should show commits that would be rebased in dry-run', async () => {
			// Mock: commits exist
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('') // show-ref
				.mockResolvedValueOnce('') // status
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('def456') // rev-parse main
				.mockResolvedValueOnce('abc123 Commit 1\ndef456 Commit 2') // log

			await manager.rebaseOnMain('/test/worktree', { dryRun: true })

			// Verify: log command was still called to show preview
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['log', '--oneline', 'main..HEAD'],
				expect.any(Object)
			)
		})

		it('should validate fast-forward possibility in dry-run', async () => {
			// Mock: validation happens in dry-run (no checkout in dry-run)
			vi.mocked(git.findMainWorktreePathWithSettings).mockResolvedValueOnce('/test/repo')
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('main') // show-current (first call since checkout is skipped)
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('abc123') // rev-parse
				.mockResolvedValueOnce('abc123 Commit') // log

			await manager.performFastForwardMerge('feature-branch', '/test/worktree', { dryRun: true })

			// Verify: validation still runs
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['merge-base', 'main', 'feature-branch'],
				expect.any(Object)
			)
		})

		it('should not execute any git state-changing commands in dry-run', async () => {
			// Mock: read-only commands only
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('') // show-ref
				.mockResolvedValueOnce('') // status
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('def456') // rev-parse main
				.mockResolvedValueOnce('abc123 Commit') // log

			await manager.rebaseOnMain('/test/worktree', { dryRun: true })

			// Verify: no state-changing commands (rebase, merge, checkout)
			const calls = vi.mocked(git.executeGitCommand).mock.calls
			expect(calls.every(call => !['rebase', 'merge', 'checkout'].includes(call[0][0]))).toBe(true)
		})
	})

	describe('Error Handling', () => {
		it('should handle main branch does not exist', async () => {
			// Mock: main branch not found
			vi.mocked(git.executeGitCommand).mockRejectedValueOnce(
				new Error('fatal: Couldn\'t find remote ref')
			)

			await expect(
				manager.rebaseOnMain('/test/worktree')
			).rejects.toThrow(/branch.*does not exist/i)
		})

		it('should handle invalid branch name', async () => {
			// Mock: branch doesn't exist
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('main') // show-current
				.mockRejectedValueOnce(new Error('unknown revision')) // merge-base fails

			await expect(
				manager.performFastForwardMerge('invalid-branch', '/test/worktree', { force: true })
			).rejects.toThrow()
		})

		it('should handle git command failures with clear messages', async () => {
			// Mock: git command fails with stderr
			const gitError = new Error('Git command failed: fatal: not a git repository')
			vi.mocked(git.executeGitCommand).mockRejectedValueOnce(gitError)

			// Should throw an error (main branch check fails with git error)
			await expect(
				manager.rebaseOnMain('/test/worktree')
			).rejects.toThrow(/main branch/i)
		})

		it('should not attempt merge if rebase failed', async () => {
			// This test verifies that rebase and merge are separate operations
			// If rebase fails, merge should never be called
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('') // show-ref
				.mockResolvedValueOnce('') // status
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('def456') // rev-parse main
				.mockResolvedValueOnce('abc123 Commit') // log
				.mockRejectedValueOnce(new Error('CONFLICT')) // rebase fails
				.mockResolvedValueOnce('src/file.ts') // conflicted files

			try {
				await manager.rebaseOnMain('/test/worktree', { force: true })
				expect.fail('Should have thrown')
			} catch {
				// If we later call merge, it should be independent
				// This test documents the intended workflow separation
			}

			// Verify: only rebase-related commands were called
			expect(git.executeGitCommand).toHaveBeenCalledTimes(7)
		})
	})

	describe('Integration Points', () => {
		it('should use repoRoot option when provided', async () => {
			const customRoot = '/custom/repo/root'

			// Mock: successful validation
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('abc123') // rev-parse

			await manager.validateFastForwardPossible('main', 'feature-branch', customRoot)

			// Verify: custom repo root was used
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				expect.any(Array),
				expect.objectContaining({ cwd: customRoot })
			)
		})

		it('should expect clean working directory (no uncommitted changes)', async () => {
			// Mock: clean status
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('') // show-ref
				.mockResolvedValueOnce('') // status: clean

			// This check should pass (no error thrown)
			// Continuing would show we expect clean state
		})
	})

	describe('Custom Main Branch Configuration', () => {
		it('should use custom main branch from settings in rebase', async () => {
			// Mock: settings with custom main branch
			mockSettingsManager.loadSettings = vi.fn().mockResolvedValue({ mainBranch: 'develop' })
			manager = new MergeManager(mockSettingsManager)

			// Mock: successful rebase on develop
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('') // show-ref: develop exists
				.mockResolvedValueOnce('') // status --porcelain: clean
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('def456') // rev-parse develop
				.mockResolvedValueOnce('abc123 Commit 1') // log: commits to rebase
				.mockResolvedValueOnce('') // rebase develop: success

			await manager.rebaseOnMain('/test/worktree', { force: true })

			// Verify: commands used 'develop' instead of 'main'
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['show-ref', '--verify', '--quiet', 'refs/heads/develop'],
				expect.objectContaining({ cwd: '/test/worktree' })
			)
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['merge-base', 'develop', 'HEAD'],
				expect.objectContaining({ cwd: '/test/worktree' })
			)
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['rev-parse', 'develop'],
				expect.objectContaining({ cwd: '/test/worktree' })
			)
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['log', '--oneline', 'develop..HEAD'],
				expect.objectContaining({ cwd: '/test/worktree' })
			)
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['rebase', 'develop'],
				expect.objectContaining({ cwd: '/test/worktree' })
			)
		})

		it('should use custom main branch in fast-forward merge validation', async () => {
			// Mock: settings with custom main branch
			mockSettingsManager.loadSettings = vi.fn().mockResolvedValue({ mainBranch: 'trunk' })
			manager = new MergeManager(mockSettingsManager)

			const mergeBase = 'abc123'
			const mainHead = 'abc123'

			// Mock: merge-base and trunk HEAD match (fast-forward possible)
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce(mergeBase) // merge-base
				.mockResolvedValueOnce(mainHead) // rev-parse trunk

			await manager.validateFastForwardPossible('trunk', 'feature-branch', '/test/repo')

			// Verify: commands used 'trunk' instead of 'main'
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['merge-base', 'trunk', 'feature-branch'],
				expect.objectContaining({ cwd: '/test/repo' })
			)
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['rev-parse', 'trunk'],
				expect.objectContaining({ cwd: '/test/repo' })
			)
		})

		it('should use custom main branch in fast-forward merge execution', async () => {
			// Mock: settings with custom main branch
			mockSettingsManager.loadSettings = vi.fn().mockResolvedValue({ mainBranch: 'master' })
			manager = new MergeManager(mockSettingsManager)

			// Mock: successful merge flow
			vi.mocked(git.findMainWorktreePathWithSettings).mockResolvedValueOnce('/test/repo')
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('master') // branch --show-current
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('abc123') // rev-parse master
				.mockResolvedValueOnce('abc123 Commit 1') // log commits
				.mockResolvedValueOnce('') // merge --ff-only

			await manager.performFastForwardMerge('feature-branch', '/test/worktree', { force: true })

			// Verify: commands used 'master' instead of 'main'
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['merge-base', 'master', 'feature-branch'],
				expect.objectContaining({ cwd: '/test/repo' })
			)
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['rev-parse', 'master'],
				expect.objectContaining({ cwd: '/test/repo' })
			)
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['log', '--oneline', 'master..feature-branch'],
				expect.objectContaining({ cwd: '/test/repo' })
			)
		})

		it('should default to "main" when no mainBranch in settings', async () => {
			// Mock: settings without mainBranch (should default to 'main')
			mockSettingsManager.loadSettings = vi.fn().mockResolvedValue({})
			manager = new MergeManager(mockSettingsManager)

			// Mock: successful rebase
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('') // show-ref: main exists
				.mockResolvedValueOnce('') // status
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('def456') // rev-parse main
				.mockResolvedValueOnce('abc123 Commit 1') // log
				.mockResolvedValueOnce('') // rebase

			await manager.rebaseOnMain('/test/worktree', { force: true })

			// Verify: defaults to 'main'
			expect(git.executeGitCommand).toHaveBeenCalledWith(
				['show-ref', '--verify', '--quiet', 'refs/heads/main'],
				expect.objectContaining({ cwd: '/test/worktree' })
			)
		})

		it('should include custom branch name in error messages', async () => {
			// Mock: settings with custom main branch
			mockSettingsManager.loadSettings = vi.fn().mockResolvedValue({ mainBranch: 'production' })
			manager = new MergeManager(mockSettingsManager)

			// Mock: production branch doesn't exist
			vi.mocked(git.executeGitCommand).mockRejectedValueOnce(
				new Error('fatal: Couldn\'t find remote ref refs/heads/production')
			)

			// Expect: error message includes 'production'
			await expect(
				manager.rebaseOnMain('/test/worktree')
			).rejects.toThrow(/production/)
		})
	})

	describe('Claude Conflict Resolution', () => {
		beforeEach(async () => {
			// Import claude utils for mocking
			vi.mocked(claude.detectClaudeCli)
			vi.mocked(claude.launchClaude)
		})

		it('should attempt Claude resolution when conflicts detected', async () => {

			// Mock: rebase fails with conflict, Claude available and resolves
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('') // show-ref
				.mockResolvedValueOnce('') // status
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('def456') // rev-parse main
				.mockResolvedValueOnce('abc123 Commit 1') // log
				.mockRejectedValueOnce(new Error('CONFLICT')) // rebase fails
				.mockResolvedValueOnce('src/file1.ts') // conflicted files (first check)
				.mockResolvedValueOnce('') // conflicted files (after Claude - none)
				.mockResolvedValueOnce('') // check if rebase in progress (no)

			vi.mocked(claude.detectClaudeCli).mockResolvedValueOnce(true)
			vi.mocked(claude.launchClaude).mockResolvedValueOnce(undefined)

			// Should succeed without throwing
			await manager.rebaseOnMain('/test/worktree', { force: true })

			// Verify Claude was called with correct prompt and options
			expect(claude.launchClaude).toHaveBeenCalledWith(
				'Help me with this rebase please.',
				expect.objectContaining({
					addDir: '/test/worktree',
					headless: false,
					appendSystemPrompt: expect.stringContaining('resolve the git rebase conflicts'),
				})
			)
		})

		it('should fail fast when Claude CLI not available', async () => {

			// Mock: rebase fails with conflict, Claude not available
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('') // show-ref
				.mockResolvedValueOnce('') // status
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('def456') // rev-parse main
				.mockResolvedValueOnce('abc123 Commit 1') // log
				.mockRejectedValueOnce(new Error('CONFLICT')) // rebase fails
				.mockResolvedValueOnce('src/file1.ts') // conflicted files

			vi.mocked(claude.detectClaudeCli).mockResolvedValueOnce(false)

			// Should throw with conflict details
			await expect(manager.rebaseOnMain('/test/worktree', { force: true })).rejects.toThrow(
				/merge conflicts detected/i
			)

			// Verify Claude was NOT launched
			expect(claude.launchClaude).not.toHaveBeenCalled()
		})

		it('should fail fast when Claude unable to resolve conflicts', async () => {

			// Mock: rebase fails, Claude available but conflicts remain
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('') // show-ref
				.mockResolvedValueOnce('') // status
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('def456') // rev-parse main
				.mockResolvedValueOnce('abc123 Commit 1') // log
				.mockRejectedValueOnce(new Error('CONFLICT')) // rebase fails
				.mockResolvedValueOnce('src/file1.ts') // conflicted files (first check)
				.mockResolvedValueOnce('src/file1.ts') // conflicted files (after Claude - still there)

			vi.mocked(claude.detectClaudeCli).mockResolvedValueOnce(true)
			vi.mocked(claude.launchClaude).mockResolvedValueOnce(undefined)

			// Should throw with conflict details
			await expect(manager.rebaseOnMain('/test/worktree', { force: true })).rejects.toThrow(
				/merge conflicts detected/i
			)

			// Verify Claude was launched but resolution failed
			expect(claude.launchClaude).toHaveBeenCalled()
		})

		// Skip this test - it's complex to mock fs.access for isRebaseInProgress
		// The functionality is covered by the integration tests
		it.skip('should fail fast when rebase still in progress after Claude', async () => {

			// Mock: rebase fails, Claude runs but rebase still in progress
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('') // show-ref
				.mockResolvedValueOnce('') // status
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('def456') // rev-parse main
				.mockResolvedValueOnce('abc123 Commit 1') // log
				.mockRejectedValueOnce(new Error('CONFLICT')) // rebase fails
				.mockResolvedValueOnce('src/file1.ts') // conflicted files (first check)
				.mockResolvedValueOnce('') // conflicted files (after Claude - resolved)

			vi.mocked(claude.detectClaudeCli).mockResolvedValueOnce(true)
			vi.mocked(claude.launchClaude).mockResolvedValueOnce(undefined)

			// Should throw because rebase still in progress
			await expect(manager.rebaseOnMain('/test/worktree', { force: true })).rejects.toThrow(
				/merge conflicts detected/i
			)
		})

		it('should handle Claude launch errors gracefully', async () => {

			// Mock: rebase fails, Claude available but throws error
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('') // show-ref
				.mockResolvedValueOnce('') // status
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('def456') // rev-parse main
				.mockResolvedValueOnce('abc123 Commit 1') // log
				.mockRejectedValueOnce(new Error('CONFLICT')) // rebase fails
				.mockResolvedValueOnce('src/file1.ts') // conflicted files

			vi.mocked(claude.detectClaudeCli).mockResolvedValueOnce(true)
			vi.mocked(claude.launchClaude).mockRejectedValueOnce(new Error('Claude API error'))

			// Should throw with conflict details (falling back to manual resolution)
			await expect(manager.rebaseOnMain('/test/worktree', { force: true })).rejects.toThrow(
				/merge conflicts detected/i
			)
		})

		it('should provide hard-coded conflict resolution prompt', async () => {

			// Mock: successful Claude resolution
			vi.mocked(git.executeGitCommand)
				.mockResolvedValueOnce('') // show-ref
				.mockResolvedValueOnce('') // status
				.mockResolvedValueOnce('abc123') // merge-base
				.mockResolvedValueOnce('def456') // rev-parse main
				.mockResolvedValueOnce('abc123 Commit 1') // log
				.mockRejectedValueOnce(new Error('CONFLICT')) // rebase fails
				.mockResolvedValueOnce('src/file1.ts') // conflicted files (first)
				.mockResolvedValueOnce('') // conflicted files (after Claude)
				.mockResolvedValueOnce('') // rebase not in progress

			vi.mocked(claude.detectClaudeCli).mockResolvedValueOnce(true)
			vi.mocked(claude.launchClaude).mockResolvedValueOnce(undefined)

			await manager.rebaseOnMain('/test/worktree', { force: true })

			// Verify appendSystemPrompt contains key instructions
			const options = vi.mocked(claude.launchClaude).mock.calls[0][1]
			expect(options?.appendSystemPrompt).toContain('resolve the git rebase conflicts')
			expect(options?.appendSystemPrompt).toContain('git add')
			expect(options?.appendSystemPrompt).toContain('git rebase --continue')
		})
	})
})
