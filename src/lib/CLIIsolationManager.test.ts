import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import { CLIIsolationManager } from './CLIIsolationManager.js'
import * as packageManager from '../utils/package-manager.js'
import * as packageJsonUtils from '../utils/package-json.js'
import { logger } from '../utils/logger.js'
import type { PackageJson } from '../utils/package-json.js'

vi.mock('fs-extra')
vi.mock('../utils/package-manager.js')
vi.mock('../utils/package-json.js')
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

describe('CLIIsolationManager', () => {
  let manager: CLIIsolationManager
  const homedir = '/home/testuser'
  const hatchboxBinDir = path.join(homedir, '.hatchbox', 'bin')

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(os, 'homedir').mockReturnValue(homedir)
    manager = new CLIIsolationManager()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('setupCLIIsolation', () => {
    it('should build project successfully', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'test-cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'test-cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
      vi.mocked(fs.access).mockResolvedValueOnce(undefined)
      vi.mocked(fs.symlink).mockResolvedValueOnce(undefined)

      const originalEnv = process.env.PATH
      process.env.PATH = `${hatchboxBinDir}:/usr/bin`

      const result = await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      expect(packageManager.runScript).toHaveBeenCalledWith('build', worktreePath)
      expect(logger.info).toHaveBeenCalledWith('Building CLI tool...')
      expect(logger.success).toHaveBeenCalledWith('Build completed')
      expect(result).toEqual(['test-cli-42'])

      process.env.PATH = originalEnv
    })

    it('should create ~/.hatchbox/bin directory if not exists', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
      vi.mocked(fs.access).mockResolvedValueOnce(undefined)
      vi.mocked(fs.symlink).mockResolvedValueOnce(undefined)

      const originalEnv = process.env.PATH
      process.env.PATH = `${hatchboxBinDir}:/usr/bin`

      await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      expect(fs.ensureDir).toHaveBeenCalledWith(hatchboxBinDir)

      process.env.PATH = originalEnv
    })

    it('should create versioned symlinks for all bin entries', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = {
        hb: './dist/cli.js',
        hatchbox: './dist/cli.js'
      }

      const mockPackageJson: PackageJson = {
        name: 'hatchbox',
        scripts: { build: 'tsup' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.access).mockResolvedValue(undefined)
      vi.mocked(fs.symlink).mockResolvedValue(undefined)

      const originalEnv = process.env.PATH
      process.env.PATH = `${hatchboxBinDir}:/usr/bin`

      const result = await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      expect(fs.symlink).toHaveBeenCalledTimes(2)
      expect(fs.symlink).toHaveBeenCalledWith(
        path.resolve(worktreePath, './dist/cli.js'),
        path.join(hatchboxBinDir, 'hb-42')
      )
      expect(fs.symlink).toHaveBeenCalledWith(
        path.resolve(worktreePath, './dist/cli.js'),
        path.join(hatchboxBinDir, 'hatchbox-42')
      )
      expect(result).toEqual(['hb-42', 'hatchbox-42'])

      process.env.PATH = originalEnv
    })

    it('should create multiple symlinks for same target (hb, hatchbox)', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = {
        hb: './dist/cli.js',
        hatchbox: './dist/cli.js'
      }

      const mockPackageJson: PackageJson = {
        name: 'hatchbox',
        scripts: { build: 'tsup' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.access).mockResolvedValue(undefined)
      vi.mocked(fs.symlink).mockResolvedValue(undefined)

      const originalEnv = process.env.PATH
      process.env.PATH = `${hatchboxBinDir}:/usr/bin`

      const result = await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      expect(result).toHaveLength(2)
      expect(result).toContain('hb-42')
      expect(result).toContain('hatchbox-42')
      expect(logger.success).toHaveBeenCalledWith('CLI available: hb-42')
      expect(logger.success).toHaveBeenCalledWith('CLI available: hatchbox-42')

      process.env.PATH = originalEnv
    })

    it('should handle build failures gracefully', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockRejectedValueOnce(
        new Error('TypeScript compilation failed')
      )

      await expect(manager.setupCLIIsolation(worktreePath, 42, binEntries)).rejects.toThrow(
        'TypeScript compilation failed'
      )

      expect(logger.info).toHaveBeenCalledWith('Building CLI tool...')
      expect(logger.success).not.toHaveBeenCalledWith('Build completed')
    })

    it('should throw if bin target does not exist after build', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(false)

      await expect(manager.setupCLIIsolation(worktreePath, 42, binEntries)).rejects.toThrow(
        'Bin target does not exist: /test/worktree/dist/cli.js'
      )
    })

    it('should make symlink targets executable', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
      vi.mocked(fs.access).mockResolvedValueOnce(undefined)
      vi.mocked(fs.symlink).mockResolvedValueOnce(undefined)

      const originalEnv = process.env.PATH
      process.env.PATH = `${hatchboxBinDir}:/usr/bin`

      await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      const targetPath = path.resolve(worktreePath, './dist/cli.js')
      expect(fs.access).toHaveBeenCalledWith(targetPath, fs.constants.X_OK)

      process.env.PATH = originalEnv
    })

    it('should warn about PATH setup if not configured', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
      vi.mocked(fs.access).mockResolvedValueOnce(undefined)
      vi.mocked(fs.symlink).mockResolvedValueOnce(undefined)

      const originalEnv = process.env.PATH
      const originalShell = process.env.SHELL
      process.env.PATH = '/usr/bin:/bin'  // Does not include .hatchbox/bin
      process.env.SHELL = '/bin/zsh'

      await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('One-time PATH setup required'))
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('~/.zshrc'))

      process.env.PATH = originalEnv
      process.env.SHELL = originalShell
    })
  })

  describe('ensureHatchboxBinInPath', () => {
    it('should detect zsh and check ~/.zshrc', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
      vi.mocked(fs.access).mockResolvedValueOnce(undefined)
      vi.mocked(fs.symlink).mockResolvedValueOnce(undefined)

      const originalShell = process.env.SHELL
      const originalPath = process.env.PATH
      process.env.SHELL = '/bin/zsh'
      process.env.PATH = '/usr/bin'

      await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('~/.zshrc'))

      process.env.SHELL = originalShell
      process.env.PATH = originalPath
    })

    it('should detect bash and check ~/.bashrc', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
      vi.mocked(fs.access).mockResolvedValueOnce(undefined)
      vi.mocked(fs.symlink).mockResolvedValueOnce(undefined)

      const originalShell = process.env.SHELL
      const originalPath = process.env.PATH
      process.env.SHELL = '/bin/bash'
      process.env.PATH = '/usr/bin'

      await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('~/.bashrc'))

      process.env.SHELL = originalShell
      process.env.PATH = originalPath
    })

    it('should detect fish and check ~/.config/fish/config.fish', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
      vi.mocked(fs.access).mockResolvedValueOnce(undefined)
      vi.mocked(fs.symlink).mockResolvedValueOnce(undefined)

      const originalShell = process.env.SHELL
      const originalPath = process.env.PATH
      process.env.SHELL = '/usr/bin/fish'
      process.env.PATH = '/usr/bin'

      await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('~/.config/fish/config.fish'))

      process.env.SHELL = originalShell
      process.env.PATH = originalPath
    })

    it('should skip warning if PATH already configured', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
      vi.mocked(fs.access).mockResolvedValueOnce(undefined)
      vi.mocked(fs.symlink).mockResolvedValueOnce(undefined)

      const originalPath = process.env.PATH
      process.env.PATH = `${hatchboxBinDir}:/usr/bin`

      await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      // Should not log PATH setup warnings
      const warnCalls = vi.mocked(logger.warn).mock.calls
      const hasPathWarning = warnCalls.some(call =>
        call[0]?.includes('One-time PATH setup required')
      )
      expect(hasPathWarning).toBe(false)

      process.env.PATH = originalPath
    })

    it('should provide clear setup instructions', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
      vi.mocked(fs.access).mockResolvedValueOnce(undefined)
      vi.mocked(fs.symlink).mockResolvedValueOnce(undefined)

      const originalPath = process.env.PATH
      const originalShell = process.env.SHELL
      process.env.PATH = '/usr/bin'
      process.env.SHELL = '/bin/zsh'

      await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('One-time PATH setup required'))
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('export PATH="$HOME/.hatchbox/bin:$PATH"'))
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('source ~/.zshrc'))

      process.env.PATH = originalPath
      process.env.SHELL = originalShell
    })

    it('should handle missing shell RC files gracefully', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
      vi.mocked(fs.access).mockResolvedValueOnce(undefined)
      vi.mocked(fs.symlink).mockResolvedValueOnce(undefined)

      const originalPath = process.env.PATH
      const originalShell = process.env.SHELL
      process.env.PATH = '/usr/bin'
      process.env.SHELL = undefined

      await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      // Should still provide instructions with default shell
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('~/.bashrc'))

      process.env.PATH = originalPath
      process.env.SHELL = originalShell
    })
  })

  describe('verifyBinTargets', () => {
    it('should verify all bin targets exist', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
      vi.mocked(fs.access).mockResolvedValueOnce(undefined)
      vi.mocked(fs.symlink).mockResolvedValueOnce(undefined)

      const originalPath = process.env.PATH
      process.env.PATH = `${hatchboxBinDir}:/usr/bin`

      await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      expect(fs.pathExists).toHaveBeenCalledWith(path.resolve(worktreePath, './dist/cli.js'))

      process.env.PATH = originalPath
    })

    it('should verify bin targets are executable', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
      vi.mocked(fs.access).mockResolvedValueOnce(undefined)
      vi.mocked(fs.symlink).mockResolvedValueOnce(undefined)

      const originalPath = process.env.PATH
      process.env.PATH = `${hatchboxBinDir}:/usr/bin`

      await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      const targetPath = path.resolve(worktreePath, './dist/cli.js')
      expect(fs.access).toHaveBeenCalledWith(targetPath, fs.constants.X_OK)

      process.env.PATH = originalPath
    })

    it('should return list of missing targets', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(false)

      await expect(manager.setupCLIIsolation(worktreePath, 42, binEntries)).rejects.toThrow(
        'Bin target does not exist: /test/worktree/dist/cli.js'
      )
    })
  })
})
