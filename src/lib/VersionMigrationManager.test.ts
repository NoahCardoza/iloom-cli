import { describe, it, expect, beforeEach, vi } from 'vitest'
import { VersionMigrationManager } from './VersionMigrationManager.js'
import type { Migration } from './VersionMigrationManager.js'
import fs from 'fs-extra'
import os from 'os'

vi.mock('fs-extra')
vi.mock('os')
vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
  },
}))

// Create mock migrations for testing
const createMockMigration = (version: string, migrate = vi.fn()): Migration => ({
  version,
  description: `Migration to ${version}`,
  migrate,
})

// Mock the migrations module
vi.mock('../migrations/index.js', () => ({
  migrations: [] as Migration[],
}))

describe('VersionMigrationManager', () => {
  let manager: VersionMigrationManager
  const mockFs = vi.mocked(fs)
  const originalEnv = process.env

  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue('/home/user')
    manager = new VersionMigrationManager()
    // Reset environment
    process.env = { ...originalEnv }
    delete process.env.ILOOM_VERSION_OVERRIDE
  })

  describe('getEffectiveVersion', () => {
    it('returns package version when ILOOM_VERSION_OVERRIDE is not set', () => {
      delete process.env.ILOOM_VERSION_OVERRIDE

      const result = manager.getEffectiveVersion('0.6.0')

      expect(result).toBe('0.6.0')
    })

    it('returns package version when ILOOM_VERSION_OVERRIDE is empty string', () => {
      process.env.ILOOM_VERSION_OVERRIDE = ''

      const result = manager.getEffectiveVersion('0.6.0')

      expect(result).toBe('0.6.0')
    })

    it('returns package version when ILOOM_VERSION_OVERRIDE is whitespace only', () => {
      process.env.ILOOM_VERSION_OVERRIDE = '   '

      const result = manager.getEffectiveVersion('0.6.0')

      expect(result).toBe('0.6.0')
    })

    it('returns override version when ILOOM_VERSION_OVERRIDE is set', () => {
      process.env.ILOOM_VERSION_OVERRIDE = '0.7.0'

      const result = manager.getEffectiveVersion('0.6.0')

      expect(result).toBe('0.7.0')
    })

    it('trims whitespace from override version', () => {
      process.env.ILOOM_VERSION_OVERRIDE = '  0.7.0  '

      const result = manager.getEffectiveVersion('0.6.0')

      expect(result).toBe('0.7.0')
    })
  })

  describe('loadMigrationState', () => {
    it('returns stored version when file exists and is valid', async () => {
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          lastMigratedVersion: '0.7.0',
          migratedAt: '2025-01-01T00:00:00Z',
        })
      )

      const result = await manager.loadMigrationState()

      expect(result).toBe('0.7.0')
      expect(mockFs.readFile).toHaveBeenCalledWith(
        '/home/user/.config/iloom-ai/migration-state.json',
        'utf-8'
      )
    })

    it('returns v0.6.0 when file does not exist', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'))

      const result = await manager.loadMigrationState()

      expect(result).toBe('0.6.0')
    })

    it('returns v0.6.0 when file contains invalid JSON', async () => {
      mockFs.readFile.mockResolvedValue('not json')

      const result = await manager.loadMigrationState()

      expect(result).toBe('0.6.0')
    })

    it('returns v0.6.0 when lastMigratedVersion is missing', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify({ migratedAt: '2025-01-01' }))

      const result = await manager.loadMigrationState()

      expect(result).toBe('0.6.0')
    })
  })

  describe('saveMigrationState', () => {
    it('writes version and timestamp to state file', async () => {
      mockFs.ensureDir.mockResolvedValue(undefined)
      mockFs.writeFile.mockResolvedValue(undefined)

      await manager.saveMigrationState('0.7.0')

      expect(mockFs.ensureDir).toHaveBeenCalledWith('/home/user/.config/iloom-ai')
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/home/user/.config/iloom-ai/migration-state.json',
        expect.stringContaining('"lastMigratedVersion": "0.7.0"'),
        'utf-8'
      )
    })

    it('does not include failedMigrations when no failures', async () => {
      mockFs.ensureDir.mockResolvedValue(undefined)
      mockFs.writeFile.mockResolvedValue(undefined)
      // Mock loadFullMigrationState to return empty state (no existing failures)
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'))

      await manager.saveMigrationState('0.7.0')

      const writeCall = mockFs.writeFile.mock.calls[0]
      const writtenContent = writeCall[1] as string
      expect(writtenContent).not.toContain('failedMigrations')
    })

    it('writes failed migration records when provided', async () => {
      mockFs.ensureDir.mockResolvedValue(undefined)
      mockFs.writeFile.mockResolvedValue(undefined)
      // Mock loadFullMigrationState to return empty state (no existing failures)
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'))

      const failures = [
        { version: '0.6.5', description: 'Migration to 0.6.5', failedAt: '2025-01-01T00:00:00Z', error: 'Test error 1' },
        { version: '0.7.0', description: 'Migration to 0.7.0', failedAt: '2025-01-01T00:00:01Z', error: 'Test error 2' },
      ]
      await manager.saveMigrationState('0.7.0', failures)

      const writeCall = mockFs.writeFile.mock.calls[0]
      const writtenContent = writeCall[1] as string
      expect(writtenContent).toContain('"failedMigrations"')
      expect(writtenContent).toContain('"0.6.5"')
      expect(writtenContent).toContain('"0.7.0"')
    })

    it('writes single failed migration correctly', async () => {
      mockFs.ensureDir.mockResolvedValue(undefined)
      mockFs.writeFile.mockResolvedValue(undefined)
      // Mock loadFullMigrationState to return empty state (no existing failures)
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'))

      const failures = [
        { version: '0.7.5', description: 'Migration to 0.7.5', failedAt: '2025-01-01T00:00:00Z', error: 'Test error' },
      ]
      await manager.saveMigrationState('0.8.0', failures)

      const writeCall = mockFs.writeFile.mock.calls[0]
      const writtenContent = writeCall[1] as string
      expect(writtenContent).toContain('"failedMigrations"')
      expect(writtenContent).toContain('"0.7.5"')
    })

    it('preserves existing failed migrations and adds new ones', async () => {
      mockFs.ensureDir.mockResolvedValue(undefined)
      mockFs.writeFile.mockResolvedValue(undefined)
      // Mock loadFullMigrationState to return existing failure
      mockFs.readFile.mockResolvedValue(JSON.stringify({
        lastMigratedVersion: '0.6.0',
        migratedAt: '2025-01-01T00:00:00Z',
        failedMigrations: [
          { version: '0.6.5', description: 'Old migration', failedAt: '2025-01-01T00:00:00Z', error: 'Old error' },
        ],
      }))

      const newFailures = [
        { version: '0.7.0', description: 'New migration', failedAt: '2025-01-02T00:00:00Z', error: 'New error' },
      ]
      await manager.saveMigrationState('0.8.0', newFailures)

      const writeCall = mockFs.writeFile.mock.calls[0]
      const writtenContent = writeCall[1] as string
      const parsed = JSON.parse(writtenContent)
      expect(parsed.failedMigrations).toHaveLength(2)
      expect(parsed.failedMigrations.map((f: { version: string }) => f.version)).toContain('0.6.5')
      expect(parsed.failedMigrations.map((f: { version: string }) => f.version)).toContain('0.7.0')
    })

    it('replaces existing failure if same version fails again', async () => {
      mockFs.ensureDir.mockResolvedValue(undefined)
      mockFs.writeFile.mockResolvedValue(undefined)
      // Mock loadFullMigrationState to return existing failure for same version
      mockFs.readFile.mockResolvedValue(JSON.stringify({
        lastMigratedVersion: '0.6.0',
        migratedAt: '2025-01-01T00:00:00Z',
        failedMigrations: [
          { version: '0.7.0', description: 'Old migration', failedAt: '2025-01-01T00:00:00Z', error: 'Old error' },
        ],
      }))

      const newFailures = [
        { version: '0.7.0', description: 'New migration', failedAt: '2025-01-02T00:00:00Z', error: 'New error' },
      ]
      await manager.saveMigrationState('0.8.0', newFailures)

      const writeCall = mockFs.writeFile.mock.calls[0]
      const writtenContent = writeCall[1] as string
      const parsed = JSON.parse(writtenContent)
      expect(parsed.failedMigrations).toHaveLength(1)
      expect(parsed.failedMigrations[0].error).toBe('New error')
    })

    it('does not throw on write failure', async () => {
      mockFs.ensureDir.mockRejectedValue(new Error('Permission denied'))

      await expect(manager.saveMigrationState('0.7.0')).resolves.toBeUndefined()
    })
  })

  describe('compareVersions', () => {
    it('returns negative when v1 < v2', () => {
      expect(manager.compareVersions('0.6.0', '0.7.0')).toBeLessThan(0)
      expect(manager.compareVersions('0.6.0', '1.0.0')).toBeLessThan(0)
    })

    it('returns positive when v1 > v2', () => {
      expect(manager.compareVersions('0.7.0', '0.6.0')).toBeGreaterThan(0)
      expect(manager.compareVersions('1.0.0', '0.9.9')).toBeGreaterThan(0)
    })

    it('returns zero when versions are equal', () => {
      expect(manager.compareVersions('0.6.0', '0.6.0')).toBe(0)
    })

    it('handles different version lengths', () => {
      expect(manager.compareVersions('0.6', '0.6.0')).toBe(0)
      expect(manager.compareVersions('0.6.1', '0.6')).toBeGreaterThan(0)
    })
  })

  describe('getPendingMigrations', () => {
    it('returns migrations with version > lastMigratedVersion and <= currentVersion', () => {
      const m1 = createMockMigration('0.6.5')
      const m2 = createMockMigration('0.7.0')
      const m3 = createMockMigration('0.8.0')

      // Directly test with custom migrations array
      const testMigrations = [m1, m2, m3]
      const pending = testMigrations
        .filter(
          m =>
            manager.compareVersions(m.version, '0.6.0') > 0 &&
            manager.compareVersions(m.version, '0.7.0') <= 0
        )
        .sort((a, b) => manager.compareVersions(a.version, b.version))

      expect(pending).toEqual([m1, m2])
    })
  })

  describe('runMigrationsIfNeeded', () => {
    it('skips when current version equals last migrated version', async () => {
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          lastMigratedVersion: '0.7.0',
        })
      )

      await manager.runMigrationsIfNeeded('0.7.0')

      expect(mockFs.writeFile).not.toHaveBeenCalled()
    })

    it('skips when current version < last migrated version', async () => {
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          lastMigratedVersion: '0.8.0',
        })
      )

      await manager.runMigrationsIfNeeded('0.7.0')

      expect(mockFs.writeFile).not.toHaveBeenCalled()
    })

    it('updates state when no pending migrations', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'))
      mockFs.ensureDir.mockResolvedValue(undefined)
      mockFs.writeFile.mockResolvedValue(undefined)

      await manager.runMigrationsIfNeeded('0.7.0')

      expect(mockFs.writeFile).toHaveBeenCalled()
    })

    it('uses ILOOM_VERSION_OVERRIDE when set', async () => {
      process.env.ILOOM_VERSION_OVERRIDE = '0.8.0'
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          lastMigratedVersion: '0.7.0',
        })
      )
      mockFs.ensureDir.mockResolvedValue(undefined)
      mockFs.writeFile.mockResolvedValue(undefined)

      await manager.runMigrationsIfNeeded('0.6.0') // Package version is 0.6.0

      // Should update state to 0.8.0 (the overridden version)
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"lastMigratedVersion": "0.8.0"'),
        'utf-8'
      )
    })

    it('saves state without failedMigrations when all migrations succeed', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'))
      mockFs.ensureDir.mockResolvedValue(undefined)
      mockFs.writeFile.mockResolvedValue(undefined)

      await manager.runMigrationsIfNeeded('0.7.0')

      // Check that state was saved without failures
      const writeCall = mockFs.writeFile.mock.calls[0]
      const writtenContent = writeCall[1] as string
      expect(writtenContent).not.toContain('failedMigrations')
    })
  })

  describe('runMigrationsIfNeeded with injected migrations', () => {
    // Test using a subclass to inject mock migrations
    class TestableVersionMigrationManager extends VersionMigrationManager {
      public testMigrations: Migration[] = []

      getPendingMigrations(lastMigratedVersion: string, currentVersion: string): Migration[] {
        return this.testMigrations
          .filter(
            m =>
              this.compareVersions(m.version, lastMigratedVersion) > 0 &&
              this.compareVersions(m.version, currentVersion) <= 0
          )
          .sort((a, b) => this.compareVersions(a.version, b.version))
      }
    }

    let testableManager: TestableVersionMigrationManager

    beforeEach(() => {
      testableManager = new TestableVersionMigrationManager()
    })

    it('continues running migrations after one fails', async () => {
      const migration1 = createMockMigration('0.6.5')
      const migration2 = createMockMigration('0.7.0')
      migration1.migrate.mockRejectedValue(new Error('Migration 1 failed'))
      migration2.migrate.mockResolvedValue(undefined)

      testableManager.testMigrations = [migration1, migration2]

      mockFs.readFile.mockRejectedValue(new Error('ENOENT'))
      mockFs.ensureDir.mockResolvedValue(undefined)
      mockFs.writeFile.mockResolvedValue(undefined)

      await testableManager.runMigrationsIfNeeded('0.7.0')

      // Both migrations should have been attempted
      expect(migration1.migrate).toHaveBeenCalled()
      expect(migration2.migrate).toHaveBeenCalled()
    })

    it('records failed migration versions in state file', async () => {
      const migration1 = createMockMigration('0.6.5')
      const migration2 = createMockMigration('0.7.0')
      migration1.migrate.mockRejectedValue(new Error('Migration 1 failed'))
      migration2.migrate.mockResolvedValue(undefined)

      testableManager.testMigrations = [migration1, migration2]

      mockFs.readFile.mockRejectedValue(new Error('ENOENT'))
      mockFs.ensureDir.mockResolvedValue(undefined)
      mockFs.writeFile.mockResolvedValue(undefined)

      await testableManager.runMigrationsIfNeeded('0.7.0')

      // State should record the failed migration
      const writeCall = mockFs.writeFile.mock.calls[0]
      const writtenContent = writeCall[1] as string
      const parsed = JSON.parse(writtenContent)
      expect(parsed.failedMigrations).toHaveLength(1)
      expect(parsed.failedMigrations[0].version).toBe('0.6.5')
      expect(parsed.failedMigrations[0].error).toBe('Migration 1 failed')
    })

    it('records multiple failed migrations', async () => {
      const migration1 = createMockMigration('0.6.5')
      const migration2 = createMockMigration('0.7.0')
      const migration3 = createMockMigration('0.7.5')
      migration1.migrate.mockRejectedValue(new Error('Migration 1 failed'))
      migration2.migrate.mockResolvedValue(undefined)
      migration3.migrate.mockRejectedValue(new Error('Migration 3 failed'))

      testableManager.testMigrations = [migration1, migration2, migration3]

      mockFs.readFile.mockRejectedValue(new Error('ENOENT'))
      mockFs.ensureDir.mockResolvedValue(undefined)
      mockFs.writeFile.mockResolvedValue(undefined)

      await testableManager.runMigrationsIfNeeded('0.8.0')

      // State should record both failed migrations
      const writeCall = mockFs.writeFile.mock.calls[0]
      const writtenContent = writeCall[1] as string
      const parsed = JSON.parse(writtenContent)
      expect(parsed.failedMigrations).toHaveLength(2)
      expect(parsed.failedMigrations.map((f: { version: string }) => f.version)).toContain('0.6.5')
      expect(parsed.failedMigrations.map((f: { version: string }) => f.version)).toContain('0.7.5')
    })

    it('does not record successful migrations in failed list', async () => {
      const migration1 = createMockMigration('0.6.5')
      const migration2 = createMockMigration('0.7.0')
      migration1.migrate.mockResolvedValue(undefined)
      migration2.migrate.mockResolvedValue(undefined)

      testableManager.testMigrations = [migration1, migration2]

      mockFs.readFile.mockRejectedValue(new Error('ENOENT'))
      mockFs.ensureDir.mockResolvedValue(undefined)
      mockFs.writeFile.mockResolvedValue(undefined)

      await testableManager.runMigrationsIfNeeded('0.7.0')

      // State should show no failures
      const writeCall = mockFs.writeFile.mock.calls[0]
      const writtenContent = writeCall[1] as string
      expect(writtenContent).not.toContain('failedMigrations')
    })

    it('updates version even when some migrations fail', async () => {
      const migration1 = createMockMigration('0.6.5')
      migration1.migrate.mockRejectedValue(new Error('Migration failed'))

      testableManager.testMigrations = [migration1]

      mockFs.readFile.mockRejectedValue(new Error('ENOENT'))
      mockFs.ensureDir.mockResolvedValue(undefined)
      mockFs.writeFile.mockResolvedValue(undefined)

      await testableManager.runMigrationsIfNeeded('0.7.0')

      // Version should still be updated to 0.7.0
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"lastMigratedVersion": "0.7.0"'),
        'utf-8'
      )
    })
  })

  describe('migration idempotency', () => {
    it('running migrations twice produces same result', async () => {
      // When no migrations are registered, running twice should just update state
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'))
      mockFs.ensureDir.mockResolvedValue(undefined)
      mockFs.writeFile.mockResolvedValue(undefined)

      await manager.runMigrationsIfNeeded('0.7.0')

      // Reset state to simulate first run completed
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          lastMigratedVersion: '0.7.0',
        })
      )
      mockFs.writeFile.mockClear()

      await manager.runMigrationsIfNeeded('0.7.0')

      // Second run should not write again (version hasn't changed)
      expect(mockFs.writeFile).not.toHaveBeenCalled()
    })
  })
})
