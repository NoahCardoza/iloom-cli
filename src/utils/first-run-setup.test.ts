import { describe, it, expect, vi, beforeEach } from 'vitest'
import { needsFirstRunSetup, launchFirstRunSetup } from './first-run-setup.js'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { FirstRunManager } from './FirstRunManager.js'
import { getRepoRoot } from './git.js'
import { InitCommand } from '../commands/init.js'

// Mock fs modules
vi.mock('fs')
vi.mock('fs/promises')

// Mock FirstRunManager
vi.mock('./FirstRunManager.js')

// Mock git utilities
vi.mock('./git.js', () => ({
	getRepoRoot: vi.fn(),
}))

// Mock logger
vi.mock('./logger.js', () => ({
	logger: {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
		success: vi.fn(),
	},
}))

// Mock InitCommand
vi.mock('../commands/init.js', () => ({
	InitCommand: vi.fn(() => ({
		execute: vi.fn().mockResolvedValue(undefined),
	})),
}))

// Mock prompt utilities
vi.mock('./prompt.js', () => ({
	waitForKeypress: vi.fn().mockResolvedValue('Enter'),
}))

describe('first-run-setup', () => {
	const mockIsProjectConfigured = vi.fn()
	const mockMarkProjectAsConfigured = vi.fn()
	const mockRepoRoot = '/test/repo/root'

	beforeEach(() => {
		vi.clearAllMocks()
		// Default mock: git repo root found
		vi.mocked(getRepoRoot).mockResolvedValue(mockRepoRoot)
		// Default mock: project is not configured globally
		mockIsProjectConfigured.mockResolvedValue(false)
		mockMarkProjectAsConfigured.mockResolvedValue(undefined)
		vi.mocked(FirstRunManager).mockImplementation(() => ({
			isProjectConfigured: mockIsProjectConfigured,
			markProjectAsConfigured: mockMarkProjectAsConfigured,
			isFirstRun: vi.fn(),
			markAsRun: vi.fn(),
		}) as unknown as FirstRunManager)
	})

	describe('needsFirstRunSetup', () => {
		it('should use git repo root for project path resolution', async () => {
			mockIsProjectConfigured.mockResolvedValue(true)

			await needsFirstRunSetup()

			// Verify getRepoRoot was called
			expect(getRepoRoot).toHaveBeenCalled()
			// Verify isProjectConfigured was called with the repo root path
			expect(mockIsProjectConfigured).toHaveBeenCalledWith(mockRepoRoot)
		})

		it('should fall back to process.cwd() when not in a git repo', async () => {
			vi.mocked(getRepoRoot).mockResolvedValue(null)
			mockIsProjectConfigured.mockResolvedValue(true)
			const originalCwd = process.cwd()

			await needsFirstRunSetup()

			// Verify methods were called with cwd (since getRepoRoot returned null)
			expect(mockIsProjectConfigured).toHaveBeenCalledWith(originalCwd)
		})

		it('should return false when project is tracked as configured globally', async () => {
			mockIsProjectConfigured.mockResolvedValue(true)

			const result = await needsFirstRunSetup()

			expect(result).toBe(false)
			// Should not check local files when globally configured
			expect(existsSync).not.toHaveBeenCalled()
		})

		it('should return true when .iloom directory does not exist', async () => {
			vi.mocked(existsSync).mockReturnValue(false)

			const result = await needsFirstRunSetup()

			expect(result).toBe(true)
		})

		it('should return true when .iloom exists but both settings files are missing', async () => {
			vi.mocked(existsSync).mockImplementation((path) => {
				// .iloom directory exists
				if (path.toString().endsWith('.iloom')) return true
				// settings files don't exist
				return false
			})

			const result = await needsFirstRunSetup()

			expect(result).toBe(true)
		})

		it('should return true when .iloom exists but both settings files are empty', async () => {
			vi.mocked(existsSync).mockReturnValue(true)
			vi.mocked(readFile).mockResolvedValue('{}')

			const result = await needsFirstRunSetup()

			expect(result).toBe(true)
		})

		it('should return false when settings.json has content', async () => {
			vi.mocked(existsSync).mockReturnValue(true)
			vi.mocked(readFile).mockImplementation((path) => {
				if (path.toString().includes('settings.json')) {
					return Promise.resolve('{"mainBranch": "main"}')
				}
				return Promise.resolve('{}')
			})

			const result = await needsFirstRunSetup()

			expect(result).toBe(false)
		})

		it('should return false when settings.local.json has content', async () => {
			vi.mocked(existsSync).mockReturnValue(true)
			vi.mocked(readFile).mockImplementation((path) => {
				if (path.toString().includes('settings.local.json')) {
					return Promise.resolve('{"basePort": 3000}')
				}
				return Promise.resolve('{}')
			})

			const result = await needsFirstRunSetup()

			expect(result).toBe(false)
		})

		it('should return true when settings files have invalid JSON', async () => {
			vi.mocked(existsSync).mockReturnValue(true)
			vi.mocked(readFile).mockResolvedValue('invalid json')

			const result = await needsFirstRunSetup()

			expect(result).toBe(true)
		})

		it('should handle file read errors gracefully', async () => {
			vi.mocked(existsSync).mockReturnValue(true)
			vi.mocked(readFile).mockRejectedValue(new Error('Read error'))

			const result = await needsFirstRunSetup()

			expect(result).toBe(true)
		})
	})

	describe('launchFirstRunSetup', () => {
		it('should launch InitCommand with correct message', async () => {
			const { InitCommand } = await import('../commands/init.js')
			const { waitForKeypress } = await import('./prompt.js')
			const { logger } = await import('./logger.js')

			await launchFirstRunSetup()

			// Verify info messages
			expect(logger.info).toHaveBeenCalledWith(
				'First-time project setup detected.'
			)
			expect(logger.info).toHaveBeenCalledWith(
				'iloom will now launch an interactive configuration session with Claude.'
			)

			// Verify keypress wait
			expect(waitForKeypress).toHaveBeenCalledWith(
				'Press any key to start configuration...'
			)

			// Verify InitCommand execution
			expect(InitCommand).toHaveBeenCalled()
			const mockInstance = vi.mocked(InitCommand).mock.results[0].value
			expect(mockInstance.execute).toHaveBeenCalledWith(
				'Help me configure iloom settings for this project. This is my first time using iloom here. Note: Your iloom command will execute once we are done with configuration changes.'
			)

			// Verify completion message
			expect(logger.info).toHaveBeenCalledWith(
				'Configuration complete! Continuing with your original command...'
			)
		})

		it('should delegate project marking to InitCommand.execute()', async () => {
			// Note: markProjectAsConfigured is now called internally by InitCommand.execute()
			// when the guided init completes successfully, not directly by launchFirstRunSetup()
			await launchFirstRunSetup()

			// Verify InitCommand.execute() was called, which handles marking internally
			const mockInstance = vi.mocked(InitCommand).mock.results[0].value
			expect(mockInstance.execute).toHaveBeenCalled()
		})
	})
})
