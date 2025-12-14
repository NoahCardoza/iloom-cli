import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isVSCodeAvailable, openVSCodeWindow, isRunningInVSCode, isRunningInCursor, isCursorAvailable, isRunningInAntigravity, isAntigravityAvailable } from './vscode.js'
import { execa } from 'execa'

// Mock execa
vi.mock('execa')

describe('isRunningInVSCode', () => {
	const originalEnv = process.env

	beforeEach(() => {
		// Create a fresh copy of process.env for each test
		process.env = { ...originalEnv }
	})

	afterEach(() => {
		// Restore original environment
		process.env = originalEnv
	})

	it('should return true when TERM_PROGRAM is vscode', () => {
		process.env.TERM_PROGRAM = 'vscode'
		expect(isRunningInVSCode()).toBe(true)
	})

	it('should return false when TERM_PROGRAM is not vscode', () => {
		process.env.TERM_PROGRAM = 'iTerm.app'
		expect(isRunningInVSCode()).toBe(false)
	})

	it('should return false when TERM_PROGRAM is undefined', () => {
		delete process.env.TERM_PROGRAM
		expect(isRunningInVSCode()).toBe(false)
	})

	it('should return false when TERM_PROGRAM is empty string', () => {
		process.env.TERM_PROGRAM = ''
		expect(isRunningInVSCode()).toBe(false)
	})
})

describe('isRunningInCursor', () => {
	const originalEnv = process.env

	beforeEach(() => {
		// Create a fresh copy of process.env for each test
		process.env = { ...originalEnv }
	})

	afterEach(() => {
		// Restore original environment
		process.env = originalEnv
	})

	it('should return true when CURSOR_TRACE_ID is set', () => {
		process.env.CURSOR_TRACE_ID = 'some-trace-id'
		expect(isRunningInCursor()).toBe(true)
	})

	it('should return false when CURSOR_TRACE_ID is not set', () => {
		delete process.env.CURSOR_TRACE_ID
		expect(isRunningInCursor()).toBe(false)
	})

	it('should return false when CURSOR_TRACE_ID is empty string', () => {
		process.env.CURSOR_TRACE_ID = ''
		expect(isRunningInCursor()).toBe(false)
	})

	it('should return true even when TERM_PROGRAM is vscode (Cursor may set both)', () => {
		process.env.CURSOR_TRACE_ID = 'some-trace-id'
		process.env.TERM_PROGRAM = 'vscode'
		expect(isRunningInCursor()).toBe(true)
	})
})

describe('isRunningInAntigravity', () => {
	const originalEnv = process.env

	beforeEach(() => {
		// Create a fresh copy of process.env for each test
		process.env = { ...originalEnv }
	})

	afterEach(() => {
		// Restore original environment
		process.env = originalEnv
	})

	it('should return true when ANTIGRAVITY_CLI_ALIAS is set', () => {
		process.env.ANTIGRAVITY_CLI_ALIAS = 'agy'
		expect(isRunningInAntigravity()).toBe(true)
	})

	it('should return false when ANTIGRAVITY_CLI_ALIAS is not set', () => {
		delete process.env.ANTIGRAVITY_CLI_ALIAS
		expect(isRunningInAntigravity()).toBe(false)
	})

	it('should return false when ANTIGRAVITY_CLI_ALIAS is empty string', () => {
		process.env.ANTIGRAVITY_CLI_ALIAS = ''
		expect(isRunningInAntigravity()).toBe(false)
	})

	it('should return true even when TERM_PROGRAM is vscode (may coexist)', () => {
		process.env.ANTIGRAVITY_CLI_ALIAS = 'agy'
		process.env.TERM_PROGRAM = 'vscode'
		expect(isRunningInAntigravity()).toBe(true)
	})
})

describe('isVSCodeAvailable', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('should return true when code command exists', async () => {
		vi.mocked(execa).mockResolvedValue({} as unknown)

		const result = await isVSCodeAvailable()

		expect(result).toBe(true)
		expect(execa).toHaveBeenCalledWith('command', ['-v', 'code'], {
			shell: true,
			timeout: 5000,
		})
	})

	it('should return false when code command not found', async () => {
		vi.mocked(execa).mockRejectedValue(new Error('Command not found'))

		const result = await isVSCodeAvailable()

		expect(result).toBe(false)
	})

	it('should handle command check errors gracefully', async () => {
		vi.mocked(execa).mockRejectedValue(new Error('Unknown error'))

		const result = await isVSCodeAvailable()

		expect(result).toBe(false)
	})
})

describe('isCursorAvailable', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('should return true when cursor command exists', async () => {
		vi.mocked(execa).mockResolvedValue({} as unknown)

		const result = await isCursorAvailable()

		expect(result).toBe(true)
		expect(execa).toHaveBeenCalledWith('command', ['-v', 'cursor'], {
			shell: true,
			timeout: 5000,
		})
	})

	it('should return false when cursor command not found', async () => {
		vi.mocked(execa).mockRejectedValue(new Error('Command not found'))

		const result = await isCursorAvailable()

		expect(result).toBe(false)
	})

	it('should handle command check errors gracefully', async () => {
		vi.mocked(execa).mockRejectedValue(new Error('Unknown error'))

		const result = await isCursorAvailable()

		expect(result).toBe(false)
	})
})

describe('isAntigravityAvailable', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('should return true when agy command exists', async () => {
		vi.mocked(execa).mockResolvedValue({} as unknown)

		const result = await isAntigravityAvailable()

		expect(result).toBe(true)
		expect(execa).toHaveBeenCalledWith('command', ['-v', 'agy'], {
			shell: true,
			timeout: 5000,
		})
	})

	it('should return false when agy command not found', async () => {
		vi.mocked(execa).mockRejectedValue(new Error('Command not found'))

		const result = await isAntigravityAvailable()

		expect(result).toBe(false)
	})

	it('should handle command check errors gracefully', async () => {
		vi.mocked(execa).mockRejectedValue(new Error('Unknown error'))

		const result = await isAntigravityAvailable()

		expect(result).toBe(false)
	})
})

describe('openVSCodeWindow', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('should execute code command with workspace path', async () => {
		// Mock isVSCodeAvailable to return true
		vi.mocked(execa).mockResolvedValueOnce({} as unknown) // for availability check
		vi.mocked(execa).mockResolvedValueOnce({} as unknown) // for code command

		await openVSCodeWindow('/Users/test/workspace')

		// First call is availability check, second is actual code command
		expect(execa).toHaveBeenCalledTimes(2)
		expect(execa).toHaveBeenNthCalledWith(2, 'code', ['/Users/test/workspace'])
	})

	it('should handle spaces in workspace path', async () => {
		vi.mocked(execa).mockResolvedValueOnce({} as unknown) // for availability check
		vi.mocked(execa).mockResolvedValueOnce({} as unknown) // for code command

		await openVSCodeWindow('/Users/test/my workspace/project')

		expect(execa).toHaveBeenNthCalledWith(2, 'code', [
			'/Users/test/my workspace/project',
		])
	})

	it('should throw error when VSCode not available', async () => {
		// Mock isVSCodeAvailable to return false
		vi.mocked(execa).mockRejectedValue(new Error('Command not found'))

		await expect(openVSCodeWindow('/Users/test/workspace')).rejects.toThrow(
			'VSCode is not available'
		)
	})

	it('should throw meaningful error message', async () => {
		vi.mocked(execa).mockRejectedValue(new Error('Command not found'))

		await expect(openVSCodeWindow('/Users/test/workspace')).rejects.toThrow(
			'Install command-line tools'
		)
	})

	it('should throw error when code command fails', async () => {
		vi.mocked(execa).mockResolvedValueOnce({} as unknown) // availability check succeeds
		vi.mocked(execa).mockRejectedValueOnce(new Error('Code execution failed')) // code command fails

		await expect(openVSCodeWindow('/Users/test/workspace')).rejects.toThrow(
			'Failed to open VSCode: Code execution failed'
		)
	})
})
