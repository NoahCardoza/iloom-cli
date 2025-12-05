import { describe, it, expect, vi, beforeEach } from 'vitest'
import { execa, type ExecaReturnValue } from 'execa'
import { getIdeConfig, isIdeAvailable, openIdeWindow } from './ide.js'

vi.mock('execa')

describe('IDE Utilities', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe('getIdeConfig', () => {
		it('should return vscode preset config by default when ide setting undefined', () => {
			const config = getIdeConfig(undefined)
			expect(config).toEqual({
				command: 'code',
				args: [],
				name: 'Visual Studio Code',
			})
		})

		it('should return correct command for vscode preset', () => {
			const config = getIdeConfig({ type: 'vscode' })
			expect(config).toEqual({
				command: 'code',
				args: [],
				name: 'Visual Studio Code',
			})
		})

		it('should return correct command for cursor preset', () => {
			const config = getIdeConfig({ type: 'cursor' })
			expect(config).toEqual({
				command: 'cursor',
				args: [],
				name: 'Cursor',
			})
		})

		it('should return correct command with --nosplash for webstorm preset', () => {
			const config = getIdeConfig({ type: 'webstorm' })
			expect(config).toEqual({
				command: 'webstorm',
				args: ['--nosplash'],
				name: 'WebStorm',
			})
		})

		it('should return correct command for sublime preset', () => {
			const config = getIdeConfig({ type: 'sublime' })
			expect(config).toEqual({
				command: 'subl',
				args: [],
				name: 'Sublime Text',
			})
		})

		it('should return correct command with --nosplash for intellij preset', () => {
			const config = getIdeConfig({ type: 'intellij' })
			expect(config).toEqual({
				command: 'idea',
				args: ['--nosplash'],
				name: 'IntelliJ IDEA',
			})
		})

		it('should return correct command for windsurf preset', () => {
			const config = getIdeConfig({ type: 'windsurf' })
			expect(config).toEqual({
				command: 'surf',
				args: [],
				name: 'Windsurf',
			})
		})

		it('should return correct command for antigravity preset', () => {
			const config = getIdeConfig({ type: 'antigravity' })
			expect(config).toEqual({
				command: 'agy',
				args: [],
				name: 'Antigravity',
			})
		})
	})

	describe('isIdeAvailable', () => {
		it('should return true when IDE command exists in PATH', async () => {
			vi.mocked(execa).mockResolvedValue({} as ExecaReturnValue)
			const available = await isIdeAvailable('code')
			expect(available).toBe(true)
			expect(execa).toHaveBeenCalledWith('command', ['-v', 'code'], {
				shell: true,
				timeout: 5000,
			})
		})

		it('should return false when IDE command not found', async () => {
			vi.mocked(execa).mockRejectedValue(new Error('Command not found'))
			const available = await isIdeAvailable('nonexistent')
			expect(available).toBe(false)
		})

		it('should handle timeout gracefully', async () => {
			vi.mocked(execa).mockRejectedValue(new Error('Timeout'))
			const available = await isIdeAvailable('slow-command')
			expect(available).toBe(false)
		})
	})

	describe('openIdeWindow', () => {
		it('should launch configured IDE with workspace path', async () => {
			vi.mocked(execa).mockResolvedValue({} as ExecaReturnValue)

			await openIdeWindow('/path/to/workspace', { type: 'cursor' })

			// First call: check availability
			expect(execa).toHaveBeenNthCalledWith(1, 'command', ['-v', 'cursor'], {
				shell: true,
				timeout: 5000,
			})
			// Second call: launch IDE
			expect(execa).toHaveBeenNthCalledWith(2, 'cursor', ['/path/to/workspace'])
		})

		it('should use default vscode when no IDE configured', async () => {
			vi.mocked(execa).mockResolvedValue({} as ExecaReturnValue)

			await openIdeWindow('/path/to/workspace', undefined)

			// First call: check availability
			expect(execa).toHaveBeenNthCalledWith(1, 'command', ['-v', 'code'], {
				shell: true,
				timeout: 5000,
			})
			// Second call: launch IDE
			expect(execa).toHaveBeenNthCalledWith(2, 'code', ['/path/to/workspace'])
		})

		it('should throw descriptive error when IDE not available', async () => {
			vi.mocked(execa).mockRejectedValue(new Error('Command not found'))

			await expect(
				openIdeWindow('/path/to/workspace', { type: 'cursor' })
			).rejects.toThrow('Cursor is not available')
			await expect(
				openIdeWindow('/path/to/workspace', { type: 'cursor' })
			).rejects.toThrow('The "cursor" command was not found in PATH')
		})

		it('should use --nosplash for JetBrains IDEs', async () => {
			vi.mocked(execa).mockResolvedValue({} as ExecaReturnValue)

			await openIdeWindow('/path/to/workspace', { type: 'webstorm' })

			expect(execa).toHaveBeenNthCalledWith(2, 'webstorm', [
				'--nosplash',
				'/path/to/workspace',
			])
		})

		it('should throw error when IDE launch fails', async () => {
			vi.mocked(execa)
				.mockResolvedValueOnce({} as ExecaReturnValue) // availability check passes
				.mockRejectedValueOnce(new Error('Failed to launch')) // launch fails

			await expect(
				openIdeWindow('/path/to/workspace', { type: 'vscode' })
			).rejects.toThrow('Failed to open Visual Studio Code')
		})
	})
})
