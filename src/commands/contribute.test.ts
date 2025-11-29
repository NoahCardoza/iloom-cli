import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ContributeCommand, validateDirectoryName } from './contribute.js'
import * as githubUtils from '../utils/github.js'
import * as gitUtils from '../utils/git.js'
import * as promptUtils from '../utils/prompt.js'
import { existsSync, accessSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import type { InitCommand } from './init.js'
import path from 'path'

// Mock dependencies
vi.mock('../utils/github.js')
vi.mock('../utils/git.js')
vi.mock('../utils/prompt.js')
vi.mock('fs')
vi.mock('fs/promises')
vi.mock('../utils/logger.js', () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		success: vi.fn(),
	},
}))

/**
 * Helper to create existsSync mock that returns:
 * - false for the target directory (doesn't exist yet)
 * - true for the parent directory (exists, so we can clone into it)
 */
function createExistsSyncMock(targetDir: string) {
	const absoluteTarget = path.resolve(targetDir)
	const parentDir = path.dirname(absoluteTarget)
	return (pathToCheck: string) => {
		const resolvedPath = path.resolve(pathToCheck)
		if (resolvedPath === absoluteTarget) {
			return false // target directory doesn't exist
		}
		if (resolvedPath === parentDir) {
			return true // parent directory exists
		}
		return false
	}
}

describe('ContributeCommand', () => {
	let command: ContributeCommand
	let mockProcessChdir: ReturnType<typeof vi.spyOn>
	let mockInitCommand: Pick<InitCommand, 'execute'>

	beforeEach(() => {
		// Create mock InitCommand
		mockInitCommand = {
			execute: vi.fn().mockResolvedValue(undefined),
		}

		command = new ContributeCommand(mockInitCommand as InitCommand)

		// Mock process.chdir to prevent actual directory changes
		mockProcessChdir = vi.spyOn(process, 'chdir').mockImplementation(() => {})

		// Setup default successful mocks
		vi.mocked(githubUtils.checkGhAuth).mockResolvedValue({
			hasAuth: true,
			scopes: ['repo', 'read:org'],
			username: 'testuser',
		})

		vi.mocked(githubUtils.executeGhCommand).mockResolvedValue('')
		vi.mocked(gitUtils.executeGitCommand).mockResolvedValue('')
		vi.mocked(promptUtils.promptInput).mockResolvedValue('./iloom-cli')
		vi.mocked(promptUtils.promptConfirmation).mockResolvedValue(true)

		// Mock existsSync to simulate: target doesn't exist, parent does exist
		vi.mocked(existsSync).mockImplementation(createExistsSyncMock('./iloom-cli'))

		// Mock accessSync to allow write access to parent directory
		vi.mocked(accessSync).mockImplementation(() => undefined)

		vi.mocked(mkdir).mockResolvedValue(undefined)
		vi.mocked(writeFile).mockResolvedValue(undefined)
	})

	afterEach(() => {
		mockProcessChdir.mockRestore()
	})

	describe('execute - happy path', () => {
		it('should complete workflow with existing fork and HTTPS clone', async () => {
			// Mock existing fork
			vi.mocked(githubUtils.executeGhCommand).mockResolvedValueOnce({
				name: 'iloom-cli',
				owner: { login: 'testuser' },
			})

			// Mock prompts
			vi.mocked(promptUtils.promptInput)
				.mockResolvedValueOnce('./iloom-cli') // directory

			await command.execute()

			expect(githubUtils.checkGhAuth).toHaveBeenCalled()
			expect(gitUtils.executeGitCommand).toHaveBeenCalled()
		})

		it('should create fork when none exists', async () => {
			// Mock no existing fork (404 error)
			vi.mocked(githubUtils.executeGhCommand)
				.mockRejectedValueOnce(new Error('Not Found'))
				.mockResolvedValueOnce('') // fork creation
				.mockResolvedValue('') // subsequent calls

			// Mock prompts
			vi.mocked(promptUtils.promptInput)
				.mockResolvedValueOnce('./iloom-cli')

			await command.execute()

			expect(githubUtils.executeGhCommand).toHaveBeenCalledWith(['repo', 'fork', 'iloom-ai/iloom-cli', '--clone=false'])
		})

	})

	describe('execute - prerequisites', () => {
		it('should error if gh CLI not authenticated', async () => {
			vi.mocked(githubUtils.checkGhAuth).mockResolvedValue({
				hasAuth: false,
				scopes: [],
			})

			await expect(command.execute()).rejects.toThrow('not authenticated')
		})

		it('should error if gh CLI check fails', async () => {
			vi.mocked(githubUtils.checkGhAuth).mockRejectedValue(new Error('gh not found'))

			await expect(command.execute()).rejects.toThrow()
		})
	})

	describe('execute - user input', () => {
		it('should use default directory when user presses enter', async () => {
			vi.mocked(promptUtils.promptInput)
				.mockResolvedValueOnce('./iloom-cli')

			vi.mocked(githubUtils.executeGhCommand).mockResolvedValue('')

			await command.execute()

			// Check the first call was for directory
			expect(promptUtils.promptInput).toHaveBeenNthCalledWith(
				1,
				expect.stringContaining('clone'),
				'./iloom-cli'
			)
		})

		it('should exit when user cancels directory prompt', async () => {
			// Mock process.exit to throw to simulate its behavior (stops execution)
			const mockExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
				throw new Error(`process.exit(${code})`)
			})

			vi.mocked(promptUtils.promptInput).mockResolvedValueOnce('')

			await expect(command.execute()).rejects.toThrow('process.exit(0)')

			expect(mockExit).toHaveBeenCalledWith(0)
			mockExit.mockRestore()
		})

		it('should error if directory already exists', async () => {
			// Provide the same directory input 3 times (for retries)
			vi.mocked(promptUtils.promptInput)
				.mockResolvedValueOnce('./existing-dir')
				.mockResolvedValueOnce('./existing-dir')
				.mockResolvedValueOnce('./existing-dir')

			// Mock existsSync to return true for target (exists) and parent
			const absoluteTarget = path.resolve('./existing-dir')
			const parentDir = path.dirname(absoluteTarget)
			vi.mocked(existsSync).mockImplementation((pathToCheck: string) => {
				const resolvedPath = path.resolve(pathToCheck)
				// Both target and parent exist
				return resolvedPath === absoluteTarget || resolvedPath === parentDir
			})

			await expect(command.execute()).rejects.toThrow('already exists')
		})

	})


	describe('execute - clone and configure', () => {
		it('should clone repository to specified directory', async () => {
			vi.mocked(promptUtils.promptInput)
				.mockResolvedValueOnce('./my-custom-dir')

			// Update existsSync mock for custom directory
			vi.mocked(existsSync).mockImplementation(createExistsSyncMock('./my-custom-dir'))

			vi.mocked(githubUtils.executeGhCommand).mockResolvedValue('')

			await command.execute()

			expect(githubUtils.executeGhCommand).toHaveBeenCalledWith(
				expect.arrayContaining(['repo', 'clone', expect.stringContaining('iloom-cli'), './my-custom-dir'])
			)
		})

		it('should add upstream remote after cloning when it does not exist', async () => {
			vi.mocked(promptUtils.promptInput)
				.mockResolvedValueOnce('./iloom-cli')

			vi.mocked(githubUtils.executeGhCommand).mockResolvedValue('')

			// Mock git commands: first call (get-url) fails, second call (add) succeeds
			vi.mocked(gitUtils.executeGitCommand)
				.mockRejectedValueOnce(new Error('No such remote'))  // get-url fails
				.mockResolvedValueOnce('')  // add succeeds

			await command.execute()

			// Should first check if upstream exists
			expect(gitUtils.executeGitCommand).toHaveBeenCalledWith(
				['remote', 'get-url', 'upstream'],
				expect.objectContaining({ cwd: expect.stringContaining('iloom-cli') })
			)
			// Then add it when it doesn't exist
			expect(gitUtils.executeGitCommand).toHaveBeenCalledWith(
				['remote', 'add', 'upstream', 'https://github.com/iloom-ai/iloom-cli.git'],
				expect.objectContaining({ cwd: expect.stringContaining('iloom-cli') })
			)
		})

		it('should create .iloom/settings.local.json with upstream remote', async () => {
			vi.mocked(promptUtils.promptInput)
				.mockResolvedValueOnce('./iloom-cli')

			vi.mocked(githubUtils.executeGhCommand).mockResolvedValue('')

			await command.execute()

			expect(mkdir).toHaveBeenCalledWith(expect.stringContaining('.iloom'), expect.objectContaining({ recursive: true }))
			expect(writeFile).toHaveBeenCalledWith(
				expect.stringContaining('settings.local.json'),
				expect.stringContaining('"remote": "upstream"')
			)
		})

	})

	describe('input validation - retry behavior', () => {
		it('should retry on invalid directory input and succeed on valid input', async () => {
			// First input invalid (reserved name), second input valid
			vi.mocked(promptUtils.promptInput)
				.mockResolvedValueOnce('./CON') // invalid - reserved name
				.mockResolvedValueOnce('./iloom-cli') // valid

			// Mock existsSync for both paths
			vi.mocked(existsSync).mockImplementation((pathToCheck: string) => {
				const resolvedPath = path.resolve(pathToCheck)
				const conTarget = path.resolve('./CON')
				const validTarget = path.resolve('./iloom-cli')
				const cwd = path.resolve('.')
				// CON target doesn't exist, valid target doesn't exist, current directory exists
				if (resolvedPath === conTarget || resolvedPath === validTarget) {
					return false
				}
				if (resolvedPath === cwd) {
					return true
				}
				return false
			})

			vi.mocked(githubUtils.executeGhCommand).mockResolvedValue('')

			await command.execute()

			// Should have been called twice for directory (retry after invalid input)
			expect(promptUtils.promptInput).toHaveBeenCalledTimes(2) // 2 for directory
		})


		it('should fail after maximum retry attempts for invalid directory', async () => {
			// Return invalid path 3 times (max retries)
			vi.mocked(promptUtils.promptInput)
				.mockResolvedValueOnce('./CON')
				.mockResolvedValueOnce('./PRN')
				.mockResolvedValueOnce('./AUX')

			// Mock existsSync to allow all these (parent exists)
			vi.mocked(existsSync).mockImplementation((pathToCheck: string) => {
				const resolvedPath = path.resolve(pathToCheck)
				const cwd = path.resolve('.')
				return resolvedPath === cwd
			})

			await expect(command.execute()).rejects.toThrow('Invalid directory after 3 attempts')
		})

	})
})

// Separate describe block for pure validation function unit tests
describe('Validation functions', () => {
	describe('validateDirectoryName', () => {
		it('should reject empty string', () => {
			const result = validateDirectoryName('')
			expect(result.isValid).toBe(false)
			expect(result.error).toContain('cannot be empty')
		})

		it('should reject whitespace-only string', () => {
			const result = validateDirectoryName('   ')
			expect(result.isValid).toBe(false)
			expect(result.error).toContain('cannot be empty')
		})

		it('should reject reserved Windows names', () => {
			const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT1']
			for (const name of reservedNames) {
				const result = validateDirectoryName(name)
				expect(result.isValid).toBe(false)
				expect(result.error).toContain('reserved name')
			}
		})

		it('should reject reserved names case-insensitively', () => {
			const result = validateDirectoryName('con')
			expect(result.isValid).toBe(false)
			expect(result.error).toContain('reserved name')
		})

		it('should reject names with invalid characters', () => {
			const invalidNames = ['test<dir', 'test>dir', 'test:dir', 'test"dir', 'test|dir', 'test?dir', 'test*dir']
			for (const name of invalidNames) {
				const result = validateDirectoryName(name)
				expect(result.isValid).toBe(false)
				expect(result.error).toContain('invalid characters')
			}
		})

		it('should reject names ending with dot', () => {
			const result = validateDirectoryName('mydir.')
			expect(result.isValid).toBe(false)
			expect(result.error).toContain('cannot end with a dot')
		})

		it('should trim whitespace before validation', () => {
			// Input with trailing space is trimmed, so 'mydir ' becomes 'mydir' which is valid
			const result = validateDirectoryName('mydir ')
			expect(result.isValid).toBe(true)
		})

		it('should accept valid directory names', () => {
			const validNames = ['iloom-cli', 'my_project', 'Project123', '.hidden-folder', 'some.folder.name']
			for (const name of validNames) {
				const result = validateDirectoryName(name)
				expect(result.isValid).toBe(true)
			}
		})
	})

})
