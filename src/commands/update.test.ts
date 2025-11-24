import { describe, it, expect, beforeEach, vi } from 'vitest'
import { UpdateCommand } from './update.js'
import { detectInstallationMethod } from '../utils/installation-detector.js'
import { logger } from '../utils/logger.js'
import { UpdateNotifier } from '../utils/update-notifier.js'
import { spawn } from 'child_process'
import { default as fs } from 'fs-extra'

// Mock dependencies
vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn()
  }
}))

vi.mock('../utils/installation-detector.js', () => ({
  detectInstallationMethod: vi.fn()
}))

vi.mock('../utils/update-notifier.js', () => ({
  UpdateNotifier: vi.fn()
}))

vi.mock('fs-extra', () => ({
  default: {
    readFile: vi.fn()
  }
}))

vi.mock('child_process', () => ({
  spawn: vi.fn()
}))

describe('UpdateCommand', () => {
  let updateCommand: UpdateCommand
  let mockExit: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    vi.clearAllMocks()
    updateCommand = new UpdateCommand()

    // Mock process.exit - throw to stop execution like real exit would
    mockExit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`)
    }) as never)

    // Default mocks for package.json reading
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
      name: '@iloom/cli',
      version: '1.0.0'
    }))
  })

  it('exits with error for non-global installations', async () => {

    // Mock: Local installation
    vi.mocked(detectInstallationMethod).mockReturnValue('local')

    // Should throw due to process.exit(1)
    await expect(updateCommand.execute()).rejects.toThrow('process.exit(1)')

    expect(mockExit).toHaveBeenCalledWith(1)
  })

  it('performs update when new version is available', async () => {

    // Mock: Global installation
    vi.mocked(detectInstallationMethod).mockReturnValue('global')

    // Mock: Update available
    const mockCheckForUpdates = vi.fn().mockResolvedValue({
      updateAvailable: true,
      currentVersion: '1.0.0',
      latestVersion: '1.1.0'
    })
    vi.mocked(UpdateNotifier).mockImplementation(() => ({
      checkForUpdates: mockCheckForUpdates
    }) as never)

    // Should throw due to process.exit(0)
    await expect(updateCommand.execute()).rejects.toThrow('process.exit(0)')

    // Verify regular update flow
    expect(spawn).toHaveBeenCalledWith('npm', ['install', '-g', '@iloom/cli@latest'], {
      detached: true,
      stdio: 'inherit'
    })
    expect(mockExit).toHaveBeenCalledWith(0)
  })

  it('exits successfully when already up to date', async () => {

    // Mock: Global installation
    vi.mocked(detectInstallationMethod).mockReturnValue('global')

    // Mock: No update available
    const mockCheckForUpdates = vi.fn().mockResolvedValue({
      updateAvailable: false,
      currentVersion: '1.0.0',
      latestVersion: '1.0.0'
    })
    vi.mocked(UpdateNotifier).mockImplementation(() => ({
      checkForUpdates: mockCheckForUpdates
    }) as never)

    await updateCommand.execute()

    // Verify success message
    expect(logger.success).toHaveBeenCalledWith('Already up to date! Current version: 1.0.0')
  })

  it('shows update plan in dry run mode', async () => {

    // Mock: Global installation
    vi.mocked(detectInstallationMethod).mockReturnValue('global')

    // Mock: Update available
    const mockCheckForUpdates = vi.fn().mockResolvedValue({
      updateAvailable: true,
      currentVersion: '1.0.0',
      latestVersion: '1.1.0'
    })
    vi.mocked(UpdateNotifier).mockImplementation(() => ({
      checkForUpdates: mockCheckForUpdates
    }) as never)

    await updateCommand.execute({ dryRun: true })

    // Verify dry run output
    expect(logger.info).toHaveBeenCalledWith('🔍 DRY RUN - showing what would be done:')
    expect(logger.info).toHaveBeenCalledWith('   Would run: npm install -g @iloom/cli@latest')
    expect(logger.info).toHaveBeenCalledWith('   Current version: 1.0.0')
    expect(logger.info).toHaveBeenCalledWith('   Target version: 1.1.0')
  })

  it('exits with error when update check fails', async () => {

    // Mock: Global installation
    vi.mocked(detectInstallationMethod).mockReturnValue('global')

    // Mock: Update check fails
    const mockCheckForUpdates = vi.fn().mockResolvedValue(null)
    vi.mocked(UpdateNotifier).mockImplementation(() => ({
      checkForUpdates: mockCheckForUpdates
    }) as never)

    // Should throw due to process.exit(1)
    await expect(updateCommand.execute()).rejects.toThrow('process.exit(1)')

    expect(mockExit).toHaveBeenCalledWith(1)
  })
})
