/**
 * CLI Integration Tests
 *
 * These tests spawn the actual CLI process (dist/cli.js) to test end-to-end behavior.
 * Unlike unit tests which mock dependencies, these integration tests verify the CLI
 * works correctly when executed as a real subprocess.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { spawn } from 'child_process'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { validateGhCliForCommand } from './cli.js'
import { GitHubService } from './lib/GitHubService.js'
import { SettingsManager } from './lib/SettingsManager.js'

// Helper function to run CLI command and capture output
function runCLI(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    // Always run from project root where dist/cli.js is located
    const projectRoot = process.cwd()
    const child = spawn('node', [join(projectRoot, 'dist/cli.js'), ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: cwd || projectRoot,
    })

    let stdout = ''
    let stderr = ''

    const timeout = globalThis.setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`CLI command timed out after 5000ms: ${args.join(' ')}`))
    }, 5000)

    const cleanup = () => {
      globalThis.clearTimeout(timeout)
      child.stdout.removeAllListeners()
      child.stderr.removeAllListeners()
      child.removeAllListeners()
    }

    child.stdout.on('data', data => {
      stdout += data.toString()
    })

    child.stderr.on('data', data => {
      stderr += data.toString()
    })

    child.on('error', error => {
      cleanup()
      reject(error)
    })

    child.on('close', code => {
      cleanup()
      resolve({ stdout, stderr, code })
    })
  })
}

describe('CLI', () => {
  it('should show help when --help flag is provided', async () => {
    const { stdout, code } = await runCLI(['--help'])
    expect(code).toBe(0)
    expect(stdout).toContain('Usage: iloom')
    expect(stdout).toContain('[options]')
    expect(stdout).toContain('[command]')
    // Check for presence of commands, not description
    expect(stdout).toContain('Commands:')
    expect(stdout).toContain('Options:')
  })

  it('should show version when --version flag is provided', async () => {
    const { stdout, code } = await runCLI(['--version'])
    expect(code).toBe(0)
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('should show available commands in help', async () => {
    const { stdout, code } = await runCLI(['--help'])
    expect(code).toBe(0)
    expect(stdout).toContain('start')
    expect(stdout).toContain('finish')
    expect(stdout).toContain('cleanup')
    expect(stdout).toContain('list')
  })

  it('should show command-specific help', async () => {
    const { stdout, code } = await runCLI(['start', '--help'])
    expect(code).toBe(0)
    expect(stdout).toContain('Create isolated workspace')
    expect(stdout).toContain('[identifier]') // Changed to optional format for interactive prompting
  })

  it('should handle invalid commands gracefully', async () => {
    const { stderr, code } = await runCLI(['invalid-command'])
    expect(code).not.toBe(0)
    expect(stderr).toContain("unknown command 'invalid-command'")
  })

  describe('Command aliases', () => {
    describe('start command aliases', () => {
      it('should support "create" as alias for "start"', async () => {
        const { stdout, code } = await runCLI(['create', '--help'])
        expect(code).toBe(0)
        expect(stdout).toContain('Create isolated workspace for an issue/PR')
        expect(stdout).toContain('[identifier]')
      })

      it('should support "up" as alias for "start"', async () => {
        const { stdout, code } = await runCLI(['up', '--help'])
        expect(code).toBe(0)
        expect(stdout).toContain('Create isolated workspace for an issue/PR')
        expect(stdout).toContain('[identifier]')
      })
    })

    describe('finish command aliases', () => {
      it('should support "dn" as alias for "finish"', async () => {
        const { stdout, code } = await runCLI(['dn', '--help'])
        expect(code).toBe(0)
        expect(stdout).toContain('Merge work and cleanup workspace')
        expect(stdout).toContain('[identifier]')
      })
    })

    describe('help output', () => {
      it('should show aliases in main help output', async () => {
        const { stdout, code } = await runCLI(['--help'])
        expect(code).toBe(0)
        // Commander.js shows first alias in format: command|alias
        expect(stdout).toMatch(/start\|new/)
        expect(stdout).toMatch(/finish\|dn/)
      })

      it('should ensure original command names still work (regression test)', async () => {
        // Verify original commands still work
        const startHelp = await runCLI(['start', '--help'])
        expect(startHelp.code).toBe(0)
        expect(startHelp.stdout).toContain('Create isolated workspace')

        const finishHelp = await runCLI(['finish', '--help'])
        expect(finishHelp.code).toBe(0)
        expect(finishHelp.stdout).toContain('Merge work and cleanup workspace')
      })
    })
  })
})

describe('Settings validation on CLI startup', () => {
  // Use temp directory to avoid git repository detection from project
  const testDir = join(tmpdir(), 'iloom-cli-test-settings')
  const iloomDirectory = join(testDir, '.iloom')
  const settingsPath = join(iloomDirectory, 'settings.json')

  beforeEach(() => {
    // Clean up any existing test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
    // Create test directory structure
    mkdirSync(testDir, { recursive: true })
    mkdirSync(iloomDirectory, { recursive: true })
  })

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  it('should fail with invalid JSON in settings file', async () => {
    // Create invalid JSON settings file
    writeFileSync(settingsPath, '{ invalid json, }')

    // Use cleanup command - list only warns on settings errors
    const { stderr, code } = await runCLI(['cleanup'], testDir)
    expect(code).toBe(1)
    expect(stderr).toContain('Configuration error')
    expect(stderr).toContain('Failed to parse settings file')
  })

  it('should fail with invalid permission mode in settings', async () => {
    // Create settings with invalid permission mode
    const invalidSettings = {
      workflows: {
        issue: {
          permissionMode: 'invalidMode'
        }
      }
    }
    writeFileSync(settingsPath, JSON.stringify(invalidSettings))

    // Use cleanup command - list only warns on settings errors
    const { stderr, code } = await runCLI(['cleanup'], testDir)
    expect(code).toBe(1)
    expect(stderr).toContain('Configuration error')
    expect(stderr).toContain('Settings validation failed')
  })

  it('should fail with empty mainBranch string', async () => {
    // Create settings with empty mainBranch
    const invalidSettings = {
      mainBranch: ''
    }
    writeFileSync(settingsPath, JSON.stringify(invalidSettings))

    // Use cleanup command - list only warns on settings errors
    const { stderr, code } = await runCLI(['cleanup'], testDir)
    expect(code).toBe(1)
    expect(stderr).toContain('Configuration error')
    expect(stderr).toContain('mainBranch')
  })

  it('should succeed when settings file is missing', async () => {
    // Don't create settings file - missing file should be OK
    const { code } = await runCLI(['list'], testDir)
    expect(code).toBe(0)
  })

  it('should succeed when settings file is empty object', async () => {
    // Create valid empty settings
    writeFileSync(settingsPath, '{}')

    const { code } = await runCLI(['list'], testDir)
    expect(code).toBe(0)
  })

  it('should succeed with valid settings', async () => {
    // Create valid settings
    const validSettings = {
      mainBranch: 'main',
      workflows: {
        issue: {
          permissionMode: 'plan'
        },
        pr: {
          permissionMode: 'acceptEdits'
        }
      },
      agents: {
        'test-agent': {
          model: 'sonnet'
        }
      }
    }
    writeFileSync(settingsPath, JSON.stringify(validSettings))

    const { code } = await runCLI(['list'], testDir)
    expect(code).toBe(0)
  })

  it('should NOT validate settings for help command', async () => {
    // Create invalid settings
    writeFileSync(settingsPath, '{ invalid json }')

    // Help should still work with invalid settings
    const { stdout, code } = await runCLI(['--help'], testDir)
    expect(code).toBe(0)
    expect(stdout).toContain('Usage: iloom')
  })

  it('should NOT validate settings for init command', async () => {
    // Create invalid settings
    writeFileSync(settingsPath, '{ invalid json }')

    // init should still work with invalid settings (it's meant to fix configuration)
    const { stdout, code } = await runCLI(['init', '--help'], testDir)
    expect(code).toBe(0)
    expect(stdout).toContain('Initialize iloom configuration')
  })

  it('should validate settings for all commands except help and list/projects', async () => {
    // Create invalid settings
    const invalidSettings = {
      workflows: {
        issue: {
          permissionMode: 'invalidMode'
        }
      }
    }
    writeFileSync(settingsPath, JSON.stringify(invalidSettings))

    // Test a few representative commands - they should all fail
    // Note: --help flag doesn't trigger validation as it shows help without running the command
    // Note: list and projects only warn on settings errors, they don't fail
    const commands = ['cleanup']

    for (const cmd of commands) {
      const { code } = await runCLI(cmd.split(' '), testDir)
      expect(code).toBe(1)
    }

    // Test that --help still works with invalid settings
    const { code: helpCode } = await runCLI(['start', '--help'], testDir)
    expect(helpCode).toBe(0)
  })

  it('should show helpful error message pointing to settings file location', async () => {
    // Create invalid JSON
    writeFileSync(settingsPath, '{ invalid }')

    // Use cleanup command - list only warns on settings errors
    const { stderr, code } = await runCLI(['cleanup'], testDir)
    expect(code).toBe(1)
    expect(stderr).toContain('Configuration error')
    expect(stderr).toContain('settings.json')
  })

  it('should warn but continue for list command with invalid settings', async () => {
    // Create invalid settings
    const invalidSettings = {
      workflows: {
        issue: {
          permissionMode: 'invalidMode'
        }
      }
    }
    writeFileSync(settingsPath, JSON.stringify(invalidSettings))

    // list should warn but not fail
    const { stderr, code } = await runCLI(['list'], testDir)
    expect(code).toBe(0)
    expect(stderr).toContain('Configuration warning')
  })

  it('should warn but continue for projects command with invalid settings', async () => {
    // Create invalid settings
    const invalidSettings = {
      workflows: {
        issue: {
          permissionMode: 'invalidMode'
        }
      }
    }
    writeFileSync(settingsPath, JSON.stringify(invalidSettings))

    // projects should warn but not fail
    const { stderr, code } = await runCLI(['projects'], testDir)
    expect(code).toBe(0)
    expect(stderr).toContain('Configuration warning')
  })
})

// Unit tests for gh CLI validation (not integration tests)
describe('GitHub CLI validation', () => {
  describe('validateGhCliForCommand', () => {
    let mockCommand: { args: string[] }
    let mockExit: ReturnType<typeof vi.spyOn<typeof process, 'exit'>>
    let mockIsCliAvailable: ReturnType<typeof vi.spyOn<typeof GitHubService, 'isCliAvailable'>>
    let mockLoadSettings: ReturnType<typeof vi.spyOn<SettingsManager, 'loadSettings'>>

    beforeEach(() => {
      // Mock process.exit
      mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

      // Create mock command with args
      mockCommand = {
        args: [] as string[],
      }

      // Mock GitHubService.isCliAvailable
      mockIsCliAvailable = vi.spyOn(GitHubService, 'isCliAvailable')

      // Mock SettingsManager
      mockLoadSettings = vi.spyOn(SettingsManager.prototype, 'loadSettings')
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    describe('commands that always require gh CLI', () => {
      it('should exit with error when gh CLI is missing for feedback command', async () => {
        mockCommand.args = ['feedback']
        mockIsCliAvailable.mockReturnValue(false)

        await validateGhCliForCommand(mockCommand)

        expect(mockExit).toHaveBeenCalledWith(1)
      })

      it('should exit with error when gh CLI is missing for contribute command', async () => {
        mockCommand.args = ['contribute']
        mockIsCliAvailable.mockReturnValue(false)

        await validateGhCliForCommand(mockCommand)

        expect(mockExit).toHaveBeenCalledWith(1)
      })

      it('should not exit when gh CLI is available for feedback command', async () => {
        mockCommand.args = ['feedback']
        mockIsCliAvailable.mockReturnValue(true)

        await validateGhCliForCommand(mockCommand)

        expect(mockExit).not.toHaveBeenCalled()
      })
    })

    describe('commands that conditionally require gh CLI', () => {
      it('should exit when gh CLI missing and provider is github', async () => {
        mockCommand.args = ['start']
        mockIsCliAvailable.mockReturnValue(false)
        mockLoadSettings.mockResolvedValue({
          issueManagement: { provider: 'github' },
        })

        await validateGhCliForCommand(mockCommand)

        expect(mockExit).toHaveBeenCalledWith(1)
      })

      it('should exit when gh CLI missing and merge mode is github-pr', async () => {
        mockCommand.args = ['finish']
        mockIsCliAvailable.mockReturnValue(false)
        mockLoadSettings.mockResolvedValue({
          issueManagement: { provider: 'linear' },
          mergeBehavior: { mode: 'github-pr' },
        })

        await validateGhCliForCommand(mockCommand)

        expect(mockExit).toHaveBeenCalledWith(1)
      })

      it('should not exit when gh CLI missing but provider is linear and merge mode is local', async () => {
        mockCommand.args = ['start']
        mockIsCliAvailable.mockReturnValue(false)
        mockLoadSettings.mockResolvedValue({
          issueManagement: { provider: 'linear' },
          mergeBehavior: { mode: 'local' },
        })

        await validateGhCliForCommand(mockCommand)

        expect(mockExit).not.toHaveBeenCalled()
      })

      it('should not exit when gh CLI is available regardless of provider', async () => {
        mockCommand.args = ['enhance']
        mockIsCliAvailable.mockReturnValue(true)
        mockLoadSettings.mockResolvedValue({
          issueManagement: { provider: 'github' },
        })

        await validateGhCliForCommand(mockCommand)

        expect(mockExit).not.toHaveBeenCalled()
      })

      it('should handle missing settings gracefully and assume gh CLI needed', async () => {
        mockCommand.args = ['start']
        mockIsCliAvailable.mockReturnValue(false)
        mockLoadSettings.mockRejectedValue(new Error('Settings file not found'))

        await validateGhCliForCommand(mockCommand)

        expect(mockExit).toHaveBeenCalledWith(1)
      })
    })

    describe('commands that only warn', () => {
      it('should not exit for init command even when gh CLI is missing', async () => {
        mockCommand.args = ['init']
        mockIsCliAvailable.mockReturnValue(false)
        mockLoadSettings.mockResolvedValue({
          issueManagement: { provider: 'github' },
        })

        await validateGhCliForCommand(mockCommand)

        expect(mockExit).not.toHaveBeenCalled()
      })

      it('should not exit for list command even when gh CLI is missing', async () => {
        mockCommand.args = ['list']
        mockIsCliAvailable.mockReturnValue(false)
        mockLoadSettings.mockResolvedValue({
          issueManagement: { provider: 'github' },
        })

        await validateGhCliForCommand(mockCommand)

        expect(mockExit).not.toHaveBeenCalled()
      })

      it('should not exit for open command even when gh CLI is missing', async () => {
        mockCommand.args = ['open']
        mockIsCliAvailable.mockReturnValue(false)
        mockLoadSettings.mockResolvedValue({
          issueManagement: { provider: 'github' },
        })

        await validateGhCliForCommand(mockCommand)

        expect(mockExit).not.toHaveBeenCalled()
      })
    })

    describe('commands that bypass gh CLI check', () => {
      it('should not check gh CLI for help command', async () => {
        mockCommand.args = ['help']
        mockIsCliAvailable.mockReturnValue(false)

        await validateGhCliForCommand(mockCommand)

        expect(mockExit).not.toHaveBeenCalled()
        expect(mockIsCliAvailable).not.toHaveBeenCalled()
      })

      it('should not check gh CLI for test commands', async () => {
        mockCommand.args = ['test-github']
        mockIsCliAvailable.mockReturnValue(false)

        await validateGhCliForCommand(mockCommand)

        expect(mockExit).not.toHaveBeenCalled()
        expect(mockIsCliAvailable).not.toHaveBeenCalled()
      })
    })

    describe('default provider handling', () => {
      it('should use github as default provider when not specified', async () => {
        mockCommand.args = ['start']
        mockIsCliAvailable.mockReturnValue(false)
        mockLoadSettings.mockResolvedValue({
          // No issueManagement.provider specified
        })

        await validateGhCliForCommand(mockCommand)

        // Should exit because default provider is 'github' and gh CLI is missing
        expect(mockExit).toHaveBeenCalledWith(1)
      })
    })
  })
})
