import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as readline from 'node:readline'
import { promptConfirmation, promptInput, waitForKeypress, promptCommitAction } from './prompt.js'

vi.mock('node:readline')

describe('prompt utils', () => {
	let mockRl: {
		question: ReturnType<typeof vi.fn>
		close: ReturnType<typeof vi.fn>
	}

	beforeEach(() => {
		mockRl = {
			question: vi.fn(),
			close: vi.fn(),
		}

		vi.mocked(readline.createInterface).mockReturnValue(
			mockRl as unknown as readline.Interface
		)
	})


	describe('promptConfirmation', () => {
		it('should return true for "y" input', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('y')
			})

			const result = await promptConfirmation('Confirm?')

			expect(result).toBe(true)
			expect(mockRl.close).toHaveBeenCalled()
		})

		it('should return true for "yes" input', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('yes')
			})

			const result = await promptConfirmation('Confirm?')

			expect(result).toBe(true)
		})

		it('should return true for "Y" input (uppercase)', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('Y')
			})

			const result = await promptConfirmation('Confirm?')

			expect(result).toBe(true)
		})

		it('should return false for "n" input', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('n')
			})

			const result = await promptConfirmation('Confirm?')

			expect(result).toBe(false)
		})

		it('should return false for "no" input', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('no')
			})

			const result = await promptConfirmation('Confirm?')

			expect(result).toBe(false)
		})

		it('should return default value for empty input (false)', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('')
			})

			const result = await promptConfirmation('Confirm?')

			expect(result).toBe(false)
		})

		it('should return default value for empty input (true)', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('')
			})

			const result = await promptConfirmation('Confirm?', true)

			expect(result).toBe(true)
		})

		it('should re-prompt on invalid input and accept valid input', async () => {
			let callCount = 0
			mockRl.question.mockImplementation((_, callback) => {
				callCount++
				if (callCount === 1) {
					callback('invalid')
				} else {
					callback('y')
				}
			})

			const result = await promptConfirmation('Confirm?', false)

			expect(result).toBe(true)
			expect(callCount).toBe(2)
		})

		it('should show [Y/n] suffix when default is true', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('')
			})

			await promptConfirmation('Confirm?', true)

			expect(mockRl.question).toHaveBeenCalledWith(
				expect.stringContaining('[Y/n]'),
				expect.any(Function)
			)
		})

		it('should show [y/N] suffix when default is false', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('')
			})

			await promptConfirmation('Confirm?', false)

			expect(mockRl.question).toHaveBeenCalledWith(
				expect.stringContaining('[y/N]'),
				expect.any(Function)
			)
		})
	})

	describe('promptInput', () => {
		it('should return user input', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('test input')
			})

			const result = await promptInput('Enter value')

			expect(result).toBe('test input')
			expect(mockRl.close).toHaveBeenCalled()
		})

		it('should trim whitespace from input', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('  test input  ')
			})

			const result = await promptInput('Enter value')

			expect(result).toBe('test input')
		})

		it('should return default value for empty input', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('')
			})

			const result = await promptInput('Enter value', 'default')

			expect(result).toBe('default')
		})

		it('should return empty string for empty input when no default', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('')
			})

			const result = await promptInput('Enter value')

			expect(result).toBe('')
		})

		it('should show default value in prompt', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('')
			})

			await promptInput('Enter value', 'default')

			expect(mockRl.question).toHaveBeenCalledWith(
				expect.stringContaining('[default]'),
				expect.any(Function)
			)
		})

		it('should not show default when not provided', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('test')
			})

			await promptInput('Enter value')

			expect(mockRl.question).toHaveBeenCalledWith(
				'Enter value: ',
				expect.any(Function)
			)
		})
	})

	describe('waitForKeypress', () => {
		let mockStdin: {
			isTTY: boolean
			setRawMode: ReturnType<typeof vi.fn>
			once: ReturnType<typeof vi.fn>
			resume: ReturnType<typeof vi.fn>
			pause: ReturnType<typeof vi.fn>
		}

		beforeEach(() => {
			mockStdin = {
				isTTY: true,
				setRawMode: vi.fn().mockReturnThis(),
				once: vi.fn(),
				resume: vi.fn(),
				pause: vi.fn(),
			}

			vi.spyOn(process, 'stdin', 'get').mockReturnValue(
				mockStdin as unknown as typeof process.stdin
			)
			vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
		})

		const simulateKeypress = (key: string) => {
			mockStdin.once.mockImplementation((event, callback) => {
				;(callback as (chunk: Buffer) => void)(Buffer.from(key))
			})
		}

		it('should resolve with the pressed key', async () => {
			const keys = ['a', 'Z', '1', ' ', '\r', '\n', 'q']

			for (const key of keys) {
				simulateKeypress(key)
				await expect(waitForKeypress()).resolves.toBe(key)
			}
		})

		it('should accept custom message and return the key', async () => {
			simulateKeypress('a')

			await expect(waitForKeypress('Custom message')).resolves.toBe('a')
		})

		it('should work with default message and return the key', async () => {
			simulateKeypress('x')

			await expect(waitForKeypress()).resolves.toBe('x')
		})

		it('should enable and restore raw mode', async () => {
			simulateKeypress('a')

			await waitForKeypress()

			// Verify raw mode was enabled and disabled (but not the exact sequence)
			expect(mockStdin.setRawMode).toHaveBeenCalledWith(true)
			expect(mockStdin.setRawMode).toHaveBeenCalledWith(false)
		})

		it('should exit process with code 130 when Ctrl+C is pressed', async () => {
			const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
				throw new Error('process.exit called')
			})

			simulateKeypress('\x03')

			await expect(waitForKeypress()).rejects.toThrow('process.exit called')
			expect(mockExit).toHaveBeenCalledWith(130)

			// Verify cleanup happened before exit
			expect(mockStdin.setRawMode).toHaveBeenCalledWith(false)
		})

		it('should write newline before exiting on Ctrl+C', async () => {
			vi.spyOn(process, 'exit').mockImplementation(() => {
				throw new Error('process.exit called')
			})

			simulateKeypress('\x03')

			try {
				await waitForKeypress()
			} catch {
				// Expected - process.exit throws in test
			}

			expect(process.stdout.write).toHaveBeenCalledWith('\n')
		})

		it('should return empty string in non-interactive environment (no TTY)', async () => {
			mockStdin.isTTY = false

			const result = await waitForKeypress('Test message')

			expect(result).toBe('')
			expect(mockStdin.setRawMode).not.toHaveBeenCalled()
		})

		it('should return empty string when setRawMode is not a function', async () => {
			// Remove setRawMode to simulate non-TTY environment
			const stdinWithoutRawMode = {
				isTTY: true,
				once: vi.fn(),
				resume: vi.fn(),
				pause: vi.fn(),
			}

			vi.spyOn(process, 'stdin', 'get').mockReturnValue(
				stdinWithoutRawMode as unknown as typeof process.stdin
			)

			const result = await waitForKeypress('Test message')

			expect(result).toBe('')
		})
	})

	describe('promptCommitAction', () => {
		let originalStdinIsTTY: boolean | undefined
		let originalCI: string | undefined

		beforeEach(() => {
			originalStdinIsTTY = process.stdin.isTTY
			originalCI = process.env.CI
			// Default to interactive environment
			Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
			delete process.env.CI
			vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
		})

		afterEach(() => {
			Object.defineProperty(process.stdin, 'isTTY', { value: originalStdinIsTTY, configurable: true })
			if (originalCI !== undefined) {
				process.env.CI = originalCI
			} else {
				delete process.env.CI
			}
		})

		it('should return "accept" for "a" input', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('a')
			})

			const result = await promptCommitAction('Test commit message')

			expect(result).toBe('accept')
			expect(mockRl.close).toHaveBeenCalled()
		})

		it('should return "accept" for "A" input (uppercase)', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('A')
			})

			const result = await promptCommitAction('Test commit message')

			expect(result).toBe('accept')
		})

		it('should return "accept" for "accept" input (full word)', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('accept')
			})

			const result = await promptCommitAction('Test commit message')

			expect(result).toBe('accept')
		})

		it('should return "accept" for empty input (default)', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('')
			})

			const result = await promptCommitAction('Test commit message')

			expect(result).toBe('accept')
		})

		it('should return "edit" for "e" input', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('e')
			})

			const result = await promptCommitAction('Test commit message')

			expect(result).toBe('edit')
		})

		it('should return "edit" for "E" input (uppercase)', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('E')
			})

			const result = await promptCommitAction('Test commit message')

			expect(result).toBe('edit')
		})

		it('should return "edit" for "edit" input (full word)', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('edit')
			})

			const result = await promptCommitAction('Test commit message')

			expect(result).toBe('edit')
		})

		it('should return "abort" for "b" input', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('b')
			})

			const result = await promptCommitAction('Test commit message')

			expect(result).toBe('abort')
		})

		it('should return "abort" for "B" input (uppercase)', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('B')
			})

			const result = await promptCommitAction('Test commit message')

			expect(result).toBe('abort')
		})

		it('should return "abort" for "abort" input (full word)', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('abort')
			})

			const result = await promptCommitAction('Test commit message')

			expect(result).toBe('abort')
		})

		it('should re-prompt on invalid input and accept valid input', async () => {
			let callCount = 0
			mockRl.question.mockImplementation((_, callback) => {
				callCount++
				if (callCount === 1) {
					callback('invalid')
				} else {
					callback('e')
				}
			})

			const result = await promptCommitAction('Test commit message')

			expect(result).toBe('edit')
			expect(callCount).toBe(2)
		})

		it('should display commit message with clear demarcation', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('a')
			})

			await promptCommitAction('My test commit message')

			expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining('='))
			expect(process.stdout.write).toHaveBeenCalledWith('COMMIT MESSAGE:\n')
			expect(process.stdout.write).toHaveBeenCalledWith('My test commit message\n')
		})

		it('should show correct options hint [A/e/b]', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('a')
			})

			await promptCommitAction('Test message')

			expect(mockRl.question).toHaveBeenCalledWith(
				expect.stringContaining('[A/e/b]'),
				expect.any(Function)
			)
		})

		it('should return "accept" immediately in non-interactive environment (no TTY)', async () => {
			Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })

			const result = await promptCommitAction('Test message')

			expect(result).toBe('accept')
			expect(mockRl.question).not.toHaveBeenCalled()
		})

		it('should return "accept" immediately in CI environment', async () => {
			process.env.CI = 'true'

			const result = await promptCommitAction('Test message')

			expect(result).toBe('accept')
			expect(mockRl.question).not.toHaveBeenCalled()
		})

		it('should properly close readline interface after response', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('e')
			})

			await promptCommitAction('Test message')

			expect(mockRl.close).toHaveBeenCalled()
		})
	})
})
