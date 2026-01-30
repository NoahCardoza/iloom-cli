import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VSCodeCommand } from './vscode.js'
import { GitWorktreeManager } from '../lib/GitWorktreeManager.js'
import { IdentifierParser } from '../utils/IdentifierParser.js'
import type { GitWorktree } from '../types/worktree.js'
import { execa } from 'execa'
import * as ideUtils from '../utils/ide.js'

// Mock dependencies
vi.mock('../lib/GitWorktreeManager.js')
vi.mock('../utils/IdentifierParser.js')
vi.mock('execa')
vi.mock('../utils/ide.js', () => ({
	isIdeAvailable: vi.fn(),
	getInstallHint: vi.fn().mockReturnValue('Install VS Code CLI'),
}))

// Mock the logger to prevent console output during tests
vi.mock('../utils/logger.js', () => ({
	logger: {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
		success: vi.fn(),
	},
}))

// Mock waitForKeypress to auto-resolve
vi.mock('../utils/prompt.js', () => ({
	waitForKeypress: vi.fn().mockResolvedValue('a'),
}))

describe('VSCodeCommand', () => {
	let command: VSCodeCommand
	let mockGitWorktreeManager: GitWorktreeManager
	let mockIdentifierParser: IdentifierParser

	const mockWorktree: GitWorktree = {
		path: '/test/worktrees/issue-87',
		branch: 'feat/issue-87__test',
		commit: 'abc123',
		bare: false,
		detached: false,
		locked: false,
	}

	beforeEach(() => {
		mockGitWorktreeManager = new GitWorktreeManager()
		mockIdentifierParser = new IdentifierParser(mockGitWorktreeManager)

		command = new VSCodeCommand(mockGitWorktreeManager, mockIdentifierParser)

		// Default: VS Code CLI is available
		vi.mocked(ideUtils.isIdeAvailable).mockResolvedValue(true)

		// Default: extension is not installed (returns empty list)
		vi.mocked(execa).mockResolvedValue({ stdout: '' } as never)
	})

	describe('extension installation', () => {
		beforeEach(() => {
			vi.mocked(mockIdentifierParser.parseForPatternDetection).mockResolvedValue({
				type: 'issue',
				number: 87,
				originalInput: '87',
			})
			vi.mocked(mockGitWorktreeManager.findWorktreeForIssue).mockResolvedValue(mockWorktree)
		})

		it('should install extension using code --install-extension', async () => {
			await command.execute({ identifier: '87' })

			expect(execa).toHaveBeenCalledWith('code', ['--install-extension', 'iloom-ai.iloom-vscode'])
		})

		it('should open VS Code with worktree path after installation', async () => {
			await command.execute({ identifier: '87' })

			expect(execa).toHaveBeenCalledWith('code', [mockWorktree.path])
		})

		it('should wait for keypress before opening VS Code', async () => {
			const { waitForKeypress } = await import('../utils/prompt.js')
			await command.execute({ identifier: '87' })

			expect(waitForKeypress).toHaveBeenCalledWith(
				expect.stringContaining('Press any key to open VS Code')
			)
		})

		it('should skip keypress prompt when wait is false (--no-wait flag)', async () => {
			const { waitForKeypress } = await import('../utils/prompt.js')
			await command.execute({ identifier: '87', wait: false })

			expect(waitForKeypress).not.toHaveBeenCalled()
			expect(execa).toHaveBeenCalledWith('code', [mockWorktree.path])
		})

		it('should wait for keypress when wait is true', async () => {
			const { waitForKeypress } = await import('../utils/prompt.js')
			await command.execute({ identifier: '87', wait: true })

			expect(waitForKeypress).toHaveBeenCalledWith(
				expect.stringContaining('Press any key to open VS Code')
			)
		})

		it('should wait for keypress when wait is undefined (default behavior)', async () => {
			const { waitForKeypress } = await import('../utils/prompt.js')
			await command.execute({ identifier: '87' })

			expect(waitForKeypress).toHaveBeenCalledWith(
				expect.stringContaining('Press any key to open VS Code')
			)
		})
	})

	describe('workspace detection', () => {
		beforeEach(() => {
			// Extension already installed - no delay
			vi.mocked(execa).mockResolvedValue({ stdout: 'iloom-ai.iloom-vscode\n' } as never)
		})

		it('should auto-detect from PR worktree pattern (_pr_N)', async () => {
			vi.spyOn(process, 'cwd').mockReturnValue('/test/worktrees/project_pr_45')

			vi.mocked(mockGitWorktreeManager.findWorktreeForPR).mockResolvedValue(mockWorktree)

			await command.execute({})

			expect(mockGitWorktreeManager.findWorktreeForPR).toHaveBeenCalledWith(45, '')
		})

		it('should auto-detect from issue directory pattern (issue-N)', async () => {
			vi.spyOn(process, 'cwd').mockReturnValue('/test/worktrees/feat-issue-87-test')

			vi.mocked(mockGitWorktreeManager.findWorktreeForIssue).mockResolvedValue(mockWorktree)

			await command.execute({})

			expect(mockGitWorktreeManager.findWorktreeForIssue).toHaveBeenCalledWith('87')
		})

		it('should find worktree for numeric issue identifier', async () => {
			vi.mocked(mockIdentifierParser.parseForPatternDetection).mockResolvedValue({
				type: 'issue',
				number: 42,
				originalInput: '42',
			})
			vi.mocked(mockGitWorktreeManager.findWorktreeForIssue).mockResolvedValue(mockWorktree)

			await command.execute({ identifier: '42' })

			expect(mockGitWorktreeManager.findWorktreeForIssue).toHaveBeenCalledWith(42)
		})

		it('should find worktree for alphanumeric identifier (ENG-123)', async () => {
			vi.mocked(mockIdentifierParser.parseForPatternDetection).mockResolvedValue({
				type: 'issue',
				number: 'ENG-123',
				originalInput: 'ENG-123',
			})
			vi.mocked(mockGitWorktreeManager.findWorktreeForIssue).mockResolvedValue(mockWorktree)

			await command.execute({ identifier: 'ENG-123' })

			expect(mockGitWorktreeManager.findWorktreeForIssue).toHaveBeenCalledWith('ENG-123')
		})

		it('should find worktree for branch name', async () => {
			vi.mocked(mockIdentifierParser.parseForPatternDetection).mockResolvedValue({
				type: 'branch',
				branchName: 'feat/my-feature',
				originalInput: 'feat/my-feature',
			})
			vi.mocked(mockGitWorktreeManager.findWorktreeForBranch).mockResolvedValue(mockWorktree)

			await command.execute({ identifier: 'feat/my-feature' })

			expect(mockGitWorktreeManager.findWorktreeForBranch).toHaveBeenCalledWith('feat/my-feature')
		})
	})

	describe('error handling', () => {
		it('should throw error when VS Code CLI not available', async () => {
			vi.mocked(ideUtils.isIdeAvailable).mockResolvedValue(false)

			await expect(command.execute({ identifier: '87' })).rejects.toThrow(
				'VS Code CLI is not available'
			)
		})

		it('should throw error when no worktree found', async () => {
			vi.mocked(mockIdentifierParser.parseForPatternDetection).mockResolvedValue({
				type: 'issue',
				number: 999,
				originalInput: '999',
			})
			vi.mocked(mockGitWorktreeManager.findWorktreeForIssue).mockResolvedValue(null)

			await expect(command.execute({ identifier: '999' })).rejects.toThrow(
				"No worktree found for issue #999. Run 'il start 999' to create one."
			)
		})

		it('should throw error when auto-detection fails', async () => {
			vi.spyOn(process, 'cwd').mockReturnValue('/test/worktrees/some-feature')

			vi.mocked(mockGitWorktreeManager.getRepoInfo).mockResolvedValue({
				currentBranch: null,
				defaultBranch: 'main',
				root: '/test/repo',
			})

			await expect(command.execute({})).rejects.toThrow('Could not auto-detect identifier')
		})
	})
})
