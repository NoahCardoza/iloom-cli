import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as net from 'node:net'
import * as childProcess from 'node:child_process'
import {
	findAllIloomSockets,
	broadcastApprovalNotification,
	clearApprovalNotification,
} from './notification.js'

vi.mock('node:fs')
vi.mock('node:net')
vi.mock('node:child_process')
vi.mock('node:os', () => ({
	tmpdir: () => '/tmp',
}))

// Helper to mock readdirSync return value (returns string[] when called without withFileTypes)
const mockReaddirSync = (files: string[]) => {
	vi.mocked(fs.readdirSync).mockReturnValue(files as unknown as fs.Dirent<Buffer>[])
}

describe('notification utils', () => {
	let originalPlatform: PropertyDescriptor | undefined

	beforeEach(() => {
		originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
		// Default to non-Windows platform
		Object.defineProperty(process, 'platform', {
			value: 'darwin',
			configurable: true,
		})
	})

	// Note: This afterEach is for process.platform restoration, not mock cleanup
	afterEach(() => {
		if (originalPlatform) {
			Object.defineProperty(process, 'platform', originalPlatform)
		}
	})

	describe('findAllIloomSockets', () => {
		it('should find sockets matching iloom-*.sock pattern', () => {
			mockReaddirSync([
				'iloom-abc123.sock',
				'iloom-def456.sock',
				'other-file.txt',
				'socket.sock',
			])

			vi.mocked(fs.statSync).mockImplementation((filePath) => {
				const path = filePath.toString()
				if (path.includes('iloom-')) {
					return { isSocket: () => true } as fs.Stats
				}
				return { isSocket: () => false } as fs.Stats
			})

			const sockets = findAllIloomSockets()

			expect(sockets).toEqual([
				'/tmp/iloom-abc123.sock',
				'/tmp/iloom-def456.sock',
			])
		})

		it('should return empty array when no sockets exist', () => {
			mockReaddirSync(['other-file.txt', 'another.log'])

			const sockets = findAllIloomSockets()

			expect(sockets).toEqual([])
		})

		it('should find named pipes on Windows', () => {
			Object.defineProperty(process, 'platform', {
				value: 'win32',
				configurable: true,
			})

			vi.mocked(childProcess.execSync).mockReturnValue(
				'\\\\.\\pipe\\iloom-abc123\n\\\\.\\pipe\\iloom-def456\n'
			)

			const sockets = findAllIloomSockets()

			expect(sockets).toEqual([
				'\\\\.\\pipe\\iloom-abc123',
				'\\\\.\\pipe\\iloom-def456',
			])
			expect(fs.readdirSync).not.toHaveBeenCalled()
			expect(childProcess.execSync).toHaveBeenCalledWith(
				expect.stringContaining('powershell'),
				expect.objectContaining({ encoding: 'utf-8', timeout: 5000 })
			)
		})

		it('should return empty array on Windows when no pipes exist', () => {
			Object.defineProperty(process, 'platform', {
				value: 'win32',
				configurable: true,
			})

			vi.mocked(childProcess.execSync).mockReturnValue('')

			const sockets = findAllIloomSockets()

			expect(sockets).toEqual([])
		})

		it('should handle PowerShell errors gracefully on Windows', () => {
			Object.defineProperty(process, 'platform', {
				value: 'win32',
				configurable: true,
			})

			vi.mocked(childProcess.execSync).mockImplementation(() => {
				throw new Error('PowerShell not found')
			})

			const sockets = findAllIloomSockets()

			expect(sockets).toEqual([])
		})

		it('should handle directory read errors gracefully', () => {
			vi.mocked(fs.readdirSync).mockImplementation(() => {
				throw new Error('Permission denied')
			})

			const sockets = findAllIloomSockets()

			expect(sockets).toEqual([])
		})

		it('should skip files that are not actual sockets', () => {
			mockReaddirSync(['iloom-abc123.sock', 'iloom-def456.sock'])

			vi.mocked(fs.statSync).mockImplementation((filePath) => {
				const path = filePath.toString()
				// Only the first one is actually a socket
				if (path.includes('abc123')) {
					return { isSocket: () => true } as fs.Stats
				}
				return { isSocket: () => false } as fs.Stats
			})

			const sockets = findAllIloomSockets()

			expect(sockets).toEqual(['/tmp/iloom-abc123.sock'])
		})

		it('should handle stat errors gracefully', () => {
			mockReaddirSync(['iloom-abc123.sock', 'iloom-def456.sock'])

			vi.mocked(fs.statSync).mockImplementation((filePath) => {
				const path = filePath.toString()
				if (path.includes('abc123')) {
					throw new Error('File not found')
				}
				return { isSocket: () => true } as fs.Stats
			})

			const sockets = findAllIloomSockets()

			expect(sockets).toEqual(['/tmp/iloom-def456.sock'])
		})
	})

	describe('broadcastApprovalNotification', () => {
		it('should broadcast waiting_for_approval to all sockets', async () => {
			mockReaddirSync(['iloom-abc123.sock'])

			vi.mocked(fs.statSync).mockReturnValue({
				isSocket: () => true,
			} as fs.Stats)

			let capturedMessage = ''
			const mockClient = {
				write: vi.fn((msg: string) => {
					capturedMessage = msg
				}),
				end: vi.fn(),
				on: vi.fn(),
			}

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			vi.mocked(net.createConnection).mockImplementation((...args: any[]) => {
				// The callback is the second argument
				const callback = args[1] as (() => void) | undefined
				// Call the callback asynchronously to mimic real behavior
				// This ensures `client` is assigned before the callback runs
				if (callback) {
					Promise.resolve().then(callback)
				}
				return mockClient as unknown as net.Socket
			})

			await broadcastApprovalNotification('/workspace/my-project')

			expect(net.createConnection).toHaveBeenCalled()
			expect(net.createConnection).toHaveBeenCalledWith(
				'/tmp/iloom-abc123.sock',
				expect.any(Function)
			)
			expect(mockClient.write).toHaveBeenCalled()

			const parsed = JSON.parse(capturedMessage.trim())
			expect(parsed.type).toBe('session_status')
			expect(parsed.status).toBe('waiting_for_approval')
			expect(parsed.hook_event_name).toBe('CommitApproval')
			expect(parsed.cwd).toBe('/workspace/my-project')
			expect(parsed.timestamp).toBeDefined()
		})

		it('should handle no sockets gracefully', async () => {
			mockReaddirSync([])

			// Should not throw
			await expect(
				broadcastApprovalNotification('/workspace')
			).resolves.toBeUndefined()

			expect(net.createConnection).not.toHaveBeenCalled()
		})

		it('should handle socket connection errors gracefully', async () => {
			mockReaddirSync(['iloom-abc123.sock'])

			vi.mocked(fs.statSync).mockReturnValue({
				isSocket: () => true,
			} as fs.Stats)

			let errorHandler: ((err: Error) => void) | undefined

			const mockClient = {
				write: vi.fn(),
				end: vi.fn(),
				on: vi.fn((event: string, handler: (err: Error) => void) => {
					if (event === 'error') {
						errorHandler = handler
					}
				}),
			}

			vi.mocked(net.createConnection).mockImplementation(() => {
				// Simulate an error by calling the error handler after the mock returns
				// Use Promise.resolve().then() to schedule this for the next microtask
				Promise.resolve().then(() => {
					if (errorHandler) {
						errorHandler(new Error('Connection refused'))
					}
				})
				return mockClient as unknown as net.Socket
			})

			// Should not throw
			await expect(
				broadcastApprovalNotification('/workspace')
			).resolves.toBeUndefined()
		})
	})

	describe('broadcastApprovalNotification - Windows', () => {
		it('should broadcast to Windows named pipes', async () => {
			Object.defineProperty(process, 'platform', {
				value: 'win32',
				configurable: true,
			})

			vi.mocked(childProcess.execSync).mockReturnValue(
				'\\\\.\\pipe\\iloom-abc123\n'
			)

			let capturedMessage = ''
			const mockClient = {
				write: vi.fn((msg: string) => {
					capturedMessage = msg
				}),
				end: vi.fn(),
				on: vi.fn(),
			}

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			vi.mocked(net.createConnection).mockImplementation((...args: any[]) => {
				const callback = args[1] as (() => void) | undefined
				if (callback) {
					Promise.resolve().then(callback)
				}
				return mockClient as unknown as net.Socket
			})

			await broadcastApprovalNotification('/workspace/my-project')

			expect(net.createConnection).toHaveBeenCalled()
			expect(net.createConnection).toHaveBeenCalledWith(
				'\\\\.\\pipe\\iloom-abc123',
				expect.any(Function)
			)
			expect(mockClient.write).toHaveBeenCalled()

			const parsed = JSON.parse(capturedMessage.trim())
			expect(parsed.type).toBe('session_status')
			expect(parsed.status).toBe('waiting_for_approval')
			expect(parsed.hook_event_name).toBe('CommitApproval')
			expect(parsed.cwd).toBe('/workspace/my-project')
		})

		it('should handle Windows named pipe connection errors gracefully', async () => {
			Object.defineProperty(process, 'platform', {
				value: 'win32',
				configurable: true,
			})

			vi.mocked(childProcess.execSync).mockReturnValue(
				'\\\\.\\pipe\\iloom-abc123\n'
			)

			let errorHandler: ((err: Error) => void) | undefined

			const mockClient = {
				write: vi.fn(),
				end: vi.fn(),
				on: vi.fn((event: string, handler: (err: Error) => void) => {
					if (event === 'error') {
						errorHandler = handler
					}
				}),
			}

			vi.mocked(net.createConnection).mockImplementation(() => {
				Promise.resolve().then(() => {
					if (errorHandler) {
						errorHandler(new Error('Pipe not found'))
					}
				})
				return mockClient as unknown as net.Socket
			})

			// Should not throw
			await expect(
				broadcastApprovalNotification('/workspace')
			).resolves.toBeUndefined()
		})
	})

	describe('clearApprovalNotification', () => {
		it('should broadcast working status to clear notification', async () => {
			mockReaddirSync(['iloom-abc123.sock'])

			vi.mocked(fs.statSync).mockReturnValue({
				isSocket: () => true,
			} as fs.Stats)

			let capturedMessage = ''
			const mockClient = {
				write: vi.fn((msg: string) => {
					capturedMessage = msg
				}),
				end: vi.fn(),
				on: vi.fn(),
			}

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			vi.mocked(net.createConnection).mockImplementation((...args: any[]) => {
				const callback = args[1] as (() => void) | undefined
				// Call the callback asynchronously to mimic real behavior
				if (callback) {
					Promise.resolve().then(callback)
				}
				return mockClient as unknown as net.Socket
			})

			await clearApprovalNotification('/workspace/my-project')

			expect(mockClient.write).toHaveBeenCalled()

			const parsed = JSON.parse(capturedMessage.trim())
			expect(parsed.type).toBe('session_status')
			expect(parsed.status).toBe('working')
			expect(parsed.hook_event_name).toBe('CommitApprovalResponse')
			expect(parsed.cwd).toBe('/workspace/my-project')
		})
	})
})
