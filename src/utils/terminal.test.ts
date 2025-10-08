import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { detectPlatform, openTerminalWindow } from './terminal.js'
import { execa } from 'execa'

// Mock execa
vi.mock('execa')

describe('detectPlatform', () => {
	const originalPlatform = process.platform

	afterEach(() => {
		// Restore original platform
		Object.defineProperty(process, 'platform', {
			value: originalPlatform,
			writable: true,
		})
	})

	it('should detect macOS (darwin)', () => {
		Object.defineProperty(process, 'platform', {
			value: 'darwin',
			writable: true,
		})
		expect(detectPlatform()).toBe('darwin')
	})

	it('should detect Linux', () => {
		Object.defineProperty(process, 'platform', {
			value: 'linux',
			writable: true,
		})
		expect(detectPlatform()).toBe('linux')
	})

	it('should detect Windows (win32)', () => {
		Object.defineProperty(process, 'platform', {
			value: 'win32',
			writable: true,
		})
		expect(detectPlatform()).toBe('win32')
	})

	it('should return unsupported for unknown platforms', () => {
		Object.defineProperty(process, 'platform', {
			value: 'freebsd',
			writable: true,
		})
		expect(detectPlatform()).toBe('unsupported')
	})
})

describe('openTerminalWindow', () => {
	const originalPlatform = process.platform

	beforeEach(() => {
		vi.clearAllMocks()
		// Set to macOS by default
		Object.defineProperty(process, 'platform', {
			value: 'darwin',
			writable: true,
		})
	})

	afterEach(() => {
		Object.defineProperty(process, 'platform', {
			value: originalPlatform,
			writable: true,
		})
	})

	it('should throw error on non-macOS platforms', async () => {
		Object.defineProperty(process, 'platform', {
			value: 'linux',
			writable: true,
		})

		await expect(openTerminalWindow({})).rejects.toThrow(
			'Terminal window launching not yet supported on linux'
		)
	})

	it('should create AppleScript for macOS', async () => {
		vi.mocked(execa).mockResolvedValue({} as unknown)

		await openTerminalWindow({
			workspacePath: '/Users/test/workspace',
		})

		expect(execa).toHaveBeenCalledWith('osascript', ['-e', expect.any(String)])
		const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
		expect(applescript).toContain('tell application "Terminal"')
		expect(applescript).toContain("cd '/Users/test/workspace'")
	})

	it('should escape single quotes in paths', async () => {
		vi.mocked(execa).mockResolvedValue({} as unknown)

		await openTerminalWindow({
			workspacePath: "/Users/test/workspace's/path",
		})

		const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
		// Single quotes should be escaped as '\'' within the do script string
		// The full pattern is: do script "cd '/Users/test/workspace'\''s/path'"
		expect(applescript).toContain("cd '/Users/test/workspace'\\\\''s/path'")
	})

	it('should include environment setup when requested', async () => {
		vi.mocked(execa).mockResolvedValue({} as unknown)

		await openTerminalWindow({
			workspacePath: '/Users/test/workspace',
			includeEnvSetup: true,
		})

		const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
		expect(applescript).toContain('source .env')
	})

	it('should export PORT variable when provided', async () => {
		vi.mocked(execa).mockResolvedValue({} as unknown)

		await openTerminalWindow({
			workspacePath: '/Users/test/workspace',
			port: 3042,
			includePortExport: true,
		})

		const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
		expect(applescript).toContain('export PORT=3042')
	})

	it('should not export PORT when includePortExport is false', async () => {
		vi.mocked(execa).mockResolvedValue({} as unknown)

		await openTerminalWindow({
			workspacePath: '/Users/test/workspace',
			port: 3042,
			includePortExport: false,
		})

		const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
		expect(applescript).not.toContain('export PORT')
	})

	it('should apply background color when provided', async () => {
		vi.mocked(execa).mockResolvedValue({} as unknown)

		await openTerminalWindow({
			workspacePath: '/Users/test/workspace',
			backgroundColor: { r: 0.5, g: 0.3, b: 0.7 },
		})

		const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
		// Math.round(0.3 * 256) = 77, not 76
		expect(applescript).toContain('set background color of newTab to {128, 77, 179}')
	})

	it('should execute command in terminal when provided', async () => {
		vi.mocked(execa).mockResolvedValue({} as unknown)

		await openTerminalWindow({
			workspacePath: '/Users/test/workspace',
			command: 'pnpm dev',
		})

		const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
		expect(applescript).toContain('pnpm dev')
	})

	it('should handle multi-command sequences with &&', async () => {
		vi.mocked(execa).mockResolvedValue({} as unknown)

		await openTerminalWindow({
			workspacePath: '/Users/test/workspace',
			includeEnvSetup: true,
			port: 3042,
			includePortExport: true,
			command: 'code . && pnpm dev',
		})

		const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
		// Should have all commands joined with &&
		expect(applescript).toContain('&&')
		expect(applescript).toContain('source .env')
		expect(applescript).toContain('export PORT=3042')
		expect(applescript).toContain('code . && pnpm dev')
	})

	it('should activate Terminal.app after opening', async () => {
		vi.mocked(execa).mockResolvedValue({} as unknown)

		await openTerminalWindow({
			workspacePath: '/Users/test/workspace',
		})

		// Should call execa twice: once for terminal creation, once for activation
		expect(execa).toHaveBeenCalledTimes(2)
		expect(execa).toHaveBeenNthCalledWith(2, 'osascript', [
			'-e',
			'tell application "Terminal" to activate',
		])
	})

	it('should throw error when AppleScript fails', async () => {
		vi.mocked(execa).mockRejectedValue(new Error('AppleScript execution failed'))

		await expect(
			openTerminalWindow({
				workspacePath: '/Users/test/workspace',
			})
		).rejects.toThrow('Failed to open terminal window: AppleScript execution failed')
	})

	it('should escape double quotes in commands', async () => {
		vi.mocked(execa).mockResolvedValue({} as unknown)

		await openTerminalWindow({
			workspacePath: '/Users/test/workspace',
			command: 'echo "Hello World"',
		})

		const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
		// Double quotes should be escaped as \"
		expect(applescript).toContain('echo \\"Hello World\\"')
	})

	it('should escape backslashes in commands', async () => {
		vi.mocked(execa).mockResolvedValue({} as unknown)

		await openTerminalWindow({
			workspacePath: '/Users/test/workspace',
			command: 'echo \\$PATH',
		})

		const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
		// Backslashes should be escaped as \\
		expect(applescript).toContain('echo \\\\$PATH')
	})
})
