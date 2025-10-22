import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { InitCommand } from './init.js'
import { ShellCompletion } from '../lib/ShellCompletion.js'
import * as prompt from '../utils/prompt.js'

// Mock prompt utilities
vi.mock('../utils/prompt.js', () => ({
  promptConfirmation: vi.fn(),
}))

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

describe('InitCommand', () => {
  let initCommand: InitCommand
  let mockShellCompletion: ShellCompletion
  let originalShell: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    originalShell = process.env.SHELL

    // Create mock shell completion
    mockShellCompletion = {
      detectShell: vi.fn(),
      getSetupInstructions: vi.fn(),
      init: vi.fn(),
      getBranchSuggestions: vi.fn(),
      getCompletionScript: vi.fn(),
      printCompletionScript: vi.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
  })

  afterEach(() => {
    if (originalShell === undefined) {
      delete process.env.SHELL
    } else {
      process.env.SHELL = originalShell
    }
  })

  describe('execute', () => {
    it('should detect user shell and offer autocomplete setup', async () => {
      vi.mocked(mockShellCompletion.detectShell).mockReturnValue('bash')
      vi.mocked(mockShellCompletion.getSetupInstructions).mockReturnValue(
        'Add eval "$(hb --completion)" to ~/.bashrc'
      )
      vi.mocked(prompt.promptConfirmation).mockResolvedValue(true)

      initCommand = new InitCommand(mockShellCompletion)
      await initCommand.execute()

      expect(mockShellCompletion.detectShell).toHaveBeenCalled()
      expect(prompt.promptConfirmation).toHaveBeenCalledWith(
        'Would you like to enable shell autocomplete?',
        true
      )
      expect(mockShellCompletion.getSetupInstructions).toHaveBeenCalledWith('bash')
    })

    it('should skip autocomplete setup if user declines', async () => {
      vi.mocked(mockShellCompletion.detectShell).mockReturnValue('zsh')
      vi.mocked(prompt.promptConfirmation).mockResolvedValue(false)

      initCommand = new InitCommand(mockShellCompletion)
      await initCommand.execute()

      expect(mockShellCompletion.detectShell).toHaveBeenCalled()
      expect(prompt.promptConfirmation).toHaveBeenCalled()
      expect(mockShellCompletion.getSetupInstructions).not.toHaveBeenCalled()
    })

    it('should generate and display setup instructions for bash', async () => {
      vi.mocked(mockShellCompletion.detectShell).mockReturnValue('bash')
      vi.mocked(mockShellCompletion.getSetupInstructions).mockReturnValue(
        'Bash instructions here'
      )
      vi.mocked(prompt.promptConfirmation).mockResolvedValue(true)

      initCommand = new InitCommand(mockShellCompletion)
      await initCommand.execute()

      expect(mockShellCompletion.getSetupInstructions).toHaveBeenCalledWith('bash')
    })

    it('should generate and display setup instructions for zsh', async () => {
      vi.mocked(mockShellCompletion.detectShell).mockReturnValue('zsh')
      vi.mocked(mockShellCompletion.getSetupInstructions).mockReturnValue('Zsh instructions here')
      vi.mocked(prompt.promptConfirmation).mockResolvedValue(true)

      initCommand = new InitCommand(mockShellCompletion)
      await initCommand.execute()

      expect(mockShellCompletion.getSetupInstructions).toHaveBeenCalledWith('zsh')
    })

    it('should handle errors gracefully when shell detection fails', async () => {
      vi.mocked(mockShellCompletion.detectShell).mockReturnValue('unknown')

      initCommand = new InitCommand(mockShellCompletion)
      await initCommand.execute()

      expect(mockShellCompletion.detectShell).toHaveBeenCalled()
      // Should exit early and not prompt for autocomplete
      expect(prompt.promptConfirmation).not.toHaveBeenCalled()
    })

    it('should work when SHELL environment variable is not set', async () => {
      delete process.env.SHELL
      vi.mocked(mockShellCompletion.detectShell).mockReturnValue('unknown')

      initCommand = new InitCommand(mockShellCompletion)
      await initCommand.execute()

      expect(mockShellCompletion.detectShell).toHaveBeenCalled()
      // Should exit early since shell is unknown
      expect(prompt.promptConfirmation).not.toHaveBeenCalled()
    })

    it('should throw error if execution fails', async () => {
      vi.mocked(mockShellCompletion.detectShell).mockImplementation(() => {
        throw new Error('Detection failed')
      })

      initCommand = new InitCommand(mockShellCompletion)

      await expect(initCommand.execute()).rejects.toThrow('Detection failed')
    })
  })
})
