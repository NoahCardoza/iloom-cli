import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isVSCodeAvailable, openVSCodeWindow } from './vscode.js'
import { execa } from 'execa'

// Mock execa
vi.mock('execa')

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
