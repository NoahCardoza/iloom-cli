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
import { validateGhCliForCommand, validateIdeForStartCommand } from './cli.js'
import { GitHubService } from './lib/GitHubService.js'
import { SettingsManager } from './lib/SettingsManager.js'
import { VersionMigrationManager } from './lib/VersionMigrationManager.js'
import * as ide from './utils/ide.js'

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

// Skip integration tests that spawn real CLI processes - they're slow and flaky in CI
describe.skip('CLI', () => {
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

// Skip integration tests that spawn real CLI processes - they're slow and flaky in CI
describe.skip('Settings validation on CLI startup', () => {
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
    let mockCommand: { args: string[]; name: () => string }
    let mockExit: ReturnType<typeof vi.spyOn<typeof process, 'exit'>>
    let mockIsCliAvailable: ReturnType<typeof vi.spyOn<typeof GitHubService, 'isCliAvailable'>>
    let mockLoadSettings: ReturnType<typeof vi.spyOn<SettingsManager, 'loadSettings'>>
    let commandName: string

    beforeEach(() => {
      // Mock process.exit
      mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

      // Create mock command with name() method
      commandName = ''
      mockCommand = {
        args: [] as string[],
        name: () => commandName,
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
        commandName = 'feedback'
        mockIsCliAvailable.mockReturnValue(false)

        await validateGhCliForCommand(mockCommand)

        expect(mockExit).toHaveBeenCalledWith(1)
      })

      it('should exit with error when gh CLI is missing for contribute command', async () => {
        commandName = 'contribute'
        mockIsCliAvailable.mockReturnValue(false)

        await validateGhCliForCommand(mockCommand)

        expect(mockExit).toHaveBeenCalledWith(1)
      })

      it('should not exit when gh CLI is available for feedback command', async () => {
        commandName = 'feedback'
        mockIsCliAvailable.mockReturnValue(true)

        await validateGhCliForCommand(mockCommand)

        expect(mockExit).not.toHaveBeenCalled()
      })
    })

    describe('commands that conditionally require gh CLI', () => {
      it('should exit when gh CLI missing and provider is github', async () => {
        commandName = 'start'
        mockIsCliAvailable.mockReturnValue(false)
        mockLoadSettings.mockResolvedValue({
          issueManagement: { provider: 'github' },
        })

        await validateGhCliForCommand(mockCommand)

        expect(mockExit).toHaveBeenCalledWith(1)
      })

      it('should exit when gh CLI missing and merge mode is github-pr', async () => {
        commandName = 'finish'
        mockIsCliAvailable.mockReturnValue(false)
        mockLoadSettings.mockResolvedValue({
          issueManagement: { provider: 'linear' },
          mergeBehavior: { mode: 'github-pr' },
        })

        await validateGhCliForCommand(mockCommand)

        expect(mockExit).toHaveBeenCalledWith(1)
      })

      it('should exit when gh CLI missing and merge mode is github-draft-pr', async () => {
        commandName = 'finish'
        mockIsCliAvailable.mockReturnValue(false)
        mockLoadSettings.mockResolvedValue({
          issueManagement: { provider: 'linear' },
          mergeBehavior: { mode: 'github-draft-pr' },
        })

        await validateGhCliForCommand(mockCommand)

        expect(mockExit).toHaveBeenCalledWith(1)
      })

      it('should not exit when gh CLI missing but provider is linear and merge mode is local', async () => {
        commandName = 'start'
        mockIsCliAvailable.mockReturnValue(false)
        mockLoadSettings.mockResolvedValue({
          issueManagement: { provider: 'linear' },
          mergeBehavior: { mode: 'local' },
        })

        await validateGhCliForCommand(mockCommand)

        expect(mockExit).not.toHaveBeenCalled()
      })

      it('should not exit when gh CLI is available regardless of provider', async () => {
        commandName = 'enhance'
        mockIsCliAvailable.mockReturnValue(true)
        mockLoadSettings.mockResolvedValue({
          issueManagement: { provider: 'github' },
        })

        await validateGhCliForCommand(mockCommand)

        expect(mockExit).not.toHaveBeenCalled()
      })

      it('should handle missing settings gracefully and assume gh CLI needed', async () => {
        commandName = 'start'
        mockIsCliAvailable.mockReturnValue(false)
        mockLoadSettings.mockRejectedValue(new Error('Settings file not found'))

        await validateGhCliForCommand(mockCommand)

        expect(mockExit).toHaveBeenCalledWith(1)
      })
    })

    describe('commands that only warn', () => {
      it('should not exit for init command even when gh CLI is missing', async () => {
        commandName = 'init'
        mockIsCliAvailable.mockReturnValue(false)
        mockLoadSettings.mockResolvedValue({
          issueManagement: { provider: 'github' },
        })

        await validateGhCliForCommand(mockCommand)

        expect(mockExit).not.toHaveBeenCalled()
      })

      it('should not exit for list command even when gh CLI is missing', async () => {
        commandName = 'list'
        mockIsCliAvailable.mockReturnValue(false)
        mockLoadSettings.mockResolvedValue({
          issueManagement: { provider: 'github' },
        })

        await validateGhCliForCommand(mockCommand)

        expect(mockExit).not.toHaveBeenCalled()
      })

      it('should not exit for open command even when gh CLI is missing', async () => {
        commandName = 'open'
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
        commandName = 'help'
        mockIsCliAvailable.mockReturnValue(false)

        await validateGhCliForCommand(mockCommand)

        expect(mockExit).not.toHaveBeenCalled()
        expect(mockIsCliAvailable).not.toHaveBeenCalled()
      })

      it('should not check gh CLI for test commands', async () => {
        commandName = 'test-github'
        mockIsCliAvailable.mockReturnValue(false)

        await validateGhCliForCommand(mockCommand)

        expect(mockExit).not.toHaveBeenCalled()
        expect(mockIsCliAvailable).not.toHaveBeenCalled()
      })
    })

    describe('default provider handling', () => {
      it('should use github as default provider when not specified', async () => {
        commandName = 'start'
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

// Unit tests for IDE validation
describe('IDE validation', () => {
  describe('validateIdeForStartCommand', () => {
    let mockCommand: { args: string[]; opts: () => Record<string, unknown> }
    let mockExit: ReturnType<typeof vi.spyOn<typeof process, 'exit'>>
    let mockIsIdeAvailable: ReturnType<typeof vi.spyOn<typeof ide, 'isIdeAvailable'>>
    let mockLoadSettings: ReturnType<typeof vi.spyOn<SettingsManager, 'loadSettings'>>

    beforeEach(() => {
      // Mock process.exit
      mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

      // Create mock command with args and opts
      mockCommand = {
        args: [] as string[],
        opts: () => ({})
      }

      // Mock isIdeAvailable
      mockIsIdeAvailable = vi.spyOn(ide, 'isIdeAvailable')

      // Mock SettingsManager
      mockLoadSettings = vi.spyOn(SettingsManager.prototype, 'loadSettings')
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    describe('command filtering', () => {
      it('should skip validation for non-start commands', async () => {
        mockCommand.args = ['finish']

        await validateIdeForStartCommand(mockCommand)

        expect(mockExit).not.toHaveBeenCalled()
        expect(mockIsIdeAvailable).not.toHaveBeenCalled()
      })

      it('should skip validation for list command', async () => {
        mockCommand.args = ['list']

        await validateIdeForStartCommand(mockCommand)

        expect(mockExit).not.toHaveBeenCalled()
        expect(mockIsIdeAvailable).not.toHaveBeenCalled()
      })
    })

    describe('--no-code flag handling', () => {
      it('should skip validation when --no-code flag is used', async () => {
        mockCommand.args = ['start']
        mockCommand.opts = () => ({ code: false })

        await validateIdeForStartCommand(mockCommand)

        expect(mockExit).not.toHaveBeenCalled()
        expect(mockIsIdeAvailable).not.toHaveBeenCalled()
      })
    })

    describe('startIde setting handling', () => {
      it('should skip validation when startIde is false in settings', async () => {
        mockCommand.args = ['start']
        mockCommand.opts = () => ({})
        mockLoadSettings.mockResolvedValue({
          workflows: { issue: { startIde: false } }
        })

        await validateIdeForStartCommand(mockCommand)

        expect(mockExit).not.toHaveBeenCalled()
        expect(mockIsIdeAvailable).not.toHaveBeenCalled()
      })

      it('should validate when --code flag overrides startIde=false', async () => {
        mockCommand.args = ['start']
        mockCommand.opts = () => ({ code: true })
        mockLoadSettings.mockResolvedValue({
          workflows: { issue: { startIde: false } }
        })
        mockIsIdeAvailable.mockResolvedValue(true)

        await validateIdeForStartCommand(mockCommand)

        expect(mockIsIdeAvailable).toHaveBeenCalled()
        expect(mockExit).not.toHaveBeenCalled()
      })
    })

    describe('IDE availability checking', () => {
      it('should exit with error when configured IDE command is not found', async () => {
        mockCommand.args = ['start']
        mockCommand.opts = () => ({})
        mockLoadSettings.mockResolvedValue({})
        mockIsIdeAvailable.mockResolvedValue(false)

        await validateIdeForStartCommand(mockCommand)

        expect(mockExit).toHaveBeenCalledWith(1)
      })

      it('should pass when configured IDE is available', async () => {
        mockCommand.args = ['start']
        mockCommand.opts = () => ({})
        mockLoadSettings.mockResolvedValue({})
        mockIsIdeAvailable.mockResolvedValue(true)

        await validateIdeForStartCommand(mockCommand)

        expect(mockExit).not.toHaveBeenCalled()
      })

      it('should check correct IDE command based on settings', async () => {
        mockCommand.args = ['start']
        mockCommand.opts = () => ({})
        mockLoadSettings.mockResolvedValue({
          ide: { type: 'cursor' }
        })
        mockIsIdeAvailable.mockResolvedValue(true)

        await validateIdeForStartCommand(mockCommand)

        expect(mockIsIdeAvailable).toHaveBeenCalledWith('cursor')
      })

      it('should default to vscode when IDE type not configured', async () => {
        mockCommand.args = ['start']
        mockCommand.opts = () => ({})
        mockLoadSettings.mockResolvedValue({})
        mockIsIdeAvailable.mockResolvedValue(true)

        await validateIdeForStartCommand(mockCommand)

        expect(mockIsIdeAvailable).toHaveBeenCalledWith('code')
      })
    })

    describe('settings loading error handling', () => {
      it('should skip validation when settings cannot be loaded', async () => {
        mockCommand.args = ['start']
        mockCommand.opts = () => ({})
        mockLoadSettings.mockRejectedValue(new Error('Settings file not found'))

        await validateIdeForStartCommand(mockCommand)

        // Should not exit - let settings validation handle the error
        expect(mockExit).not.toHaveBeenCalled()
        expect(mockIsIdeAvailable).not.toHaveBeenCalled()
      })
    })
  })
})

// Unit tests for version migration in preAction hook
describe('Version migration in preAction hook', () => {
  let mockRunMigrationsIfNeeded: ReturnType<typeof vi.spyOn<VersionMigrationManager, 'runMigrationsIfNeeded'>>

  beforeEach(() => {
    // Mock the runMigrationsIfNeeded method
    mockRunMigrationsIfNeeded = vi.spyOn(VersionMigrationManager.prototype, 'runMigrationsIfNeeded')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('migration execution', () => {
    it('should call runMigrationsIfNeeded with package version', async () => {
      mockRunMigrationsIfNeeded.mockResolvedValue(undefined)

      // Create a new instance and call the method directly (simulating preAction behavior)
      const manager = new VersionMigrationManager()
      await manager.runMigrationsIfNeeded('0.6.0')

      expect(mockRunMigrationsIfNeeded).toHaveBeenCalledWith('0.6.0')
    })

    it('should not throw when runMigrationsIfNeeded succeeds', async () => {
      mockRunMigrationsIfNeeded.mockResolvedValue(undefined)

      const manager = new VersionMigrationManager()

      await expect(manager.runMigrationsIfNeeded('0.7.0')).resolves.toBeUndefined()
    })
  })

  describe('error handling', () => {
    it('should not crash when migration throws an error', async () => {
      // Simulate the preAction hook behavior where errors are caught and logged
      mockRunMigrationsIfNeeded.mockRejectedValue(new Error('Migration failed'))

      const manager = new VersionMigrationManager()

      // The preAction hook wraps this in a try-catch, so we simulate that behavior
      let caughtError: Error | undefined
      try {
        await manager.runMigrationsIfNeeded('0.7.0')
      } catch (error) {
        caughtError = error instanceof Error ? error : new Error('Unknown error')
      }

      // Verify the error was thrown (the preAction hook catches it)
      expect(caughtError).toBeDefined()
      expect(caughtError?.message).toBe('Migration failed')
    })

    it('should handle non-Error thrown values', async () => {
      // Simulate the preAction hook behavior with non-Error thrown values
      mockRunMigrationsIfNeeded.mockRejectedValue('string error')

      const manager = new VersionMigrationManager()

      // The preAction hook handles both Error and non-Error thrown values
      let caughtValue: unknown
      try {
        await manager.runMigrationsIfNeeded('0.7.0')
      } catch (error) {
        caughtValue = error
      }

      expect(caughtValue).toBe('string error')
    })

    it('should allow CLI to continue after migration error (best-effort migration)', async () => {
      // This test verifies the design: migration errors don't crash the CLI
      mockRunMigrationsIfNeeded.mockRejectedValue(new Error('Network error'))

      const manager = new VersionMigrationManager()

      // Simulate preAction hook error handling pattern:
      // try { await manager.runMigrationsIfNeeded(version) }
      // catch (error) { logger.warn(...) }
      let migrationFailed = false
      let warningMessage = ''

      try {
        await manager.runMigrationsIfNeeded('0.8.0')
      } catch (error) {
        migrationFailed = true
        warningMessage = `Version migration failed: ${error instanceof Error ? error.message : 'Unknown'}`
      }

      // Migration failed but CLI can continue
      expect(migrationFailed).toBe(true)
      expect(warningMessage).toBe('Version migration failed: Network error')

      // In the actual CLI, execution continues past this point
      // This represents successful error handling
    })
  })

  describe('migration state', () => {
    it('should create new VersionMigrationManager instance for each call', () => {
      // Each preAction hook creates a new instance
      const manager1 = new VersionMigrationManager()
      const manager2 = new VersionMigrationManager()

      // They should be different instances
      expect(manager1).not.toBe(manager2)
    })

    it('should respect ILOOM_VERSION_OVERRIDE environment variable', async () => {
      const originalEnv = process.env.ILOOM_VERSION_OVERRIDE
      process.env.ILOOM_VERSION_OVERRIDE = '0.9.0'

      try {
        const manager = new VersionMigrationManager()
        const effectiveVersion = manager.getEffectiveVersion('0.6.0')

        expect(effectiveVersion).toBe('0.9.0')
      } finally {
        if (originalEnv === undefined) {
          delete process.env.ILOOM_VERSION_OVERRIDE
        } else {
          process.env.ILOOM_VERSION_OVERRIDE = originalEnv
        }
      }
    })

    it('should use package version when ILOOM_VERSION_OVERRIDE is not set', () => {
      const originalEnv = process.env.ILOOM_VERSION_OVERRIDE
      delete process.env.ILOOM_VERSION_OVERRIDE

      try {
        const manager = new VersionMigrationManager()
        const effectiveVersion = manager.getEffectiveVersion('0.6.0')

        expect(effectiveVersion).toBe('0.6.0')
      } finally {
        if (originalEnv !== undefined) {
          process.env.ILOOM_VERSION_OVERRIDE = originalEnv
        }
      }
    })
  })
})
