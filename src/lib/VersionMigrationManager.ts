import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import { logger } from '../utils/logger.js'
import { migrations } from '../migrations/index.js'

// Interface for a failed migration record
interface FailedMigration {
  version: string
  description: string
  failedAt: string
  error?: string
}

// Interface for migration state file content
interface MigrationState {
  lastMigratedVersion: string
  migratedAt: string
  failedMigrations?: FailedMigration[]
}

// Interface for individual migration
export interface Migration {
  version: string // Target version (e.g., '0.7.0')
  description: string
  migrate: () => Promise<void>
}

export class VersionMigrationManager {
  private readonly DEFAULT_VERSION = '0.6.0'
  private readonly VERSION_OVERRIDE_ENV = 'ILOOM_VERSION_OVERRIDE'

  // Return path to migration state file
  private getMigrationStatePath(): string {
    return path.join(os.homedir(), '.config', 'iloom-ai', 'migration-state.json')
  }

  // Get effective version, respecting ILOOM_VERSION_OVERRIDE env var
  // packageVersion is the version from package.json passed by caller
  getEffectiveVersion(packageVersion: string): string {
    const override = process.env[this.VERSION_OVERRIDE_ENV]
    if (override && override.trim() !== '') {
      logger.debug(`[VersionMigrationManager] Using version override: ${override} (package.json: ${packageVersion})`)
      return override.trim()
    }
    return packageVersion
  }

  // Load full migration state from file
  // Returns state with DEFAULT_VERSION if file missing/invalid
  async loadFullMigrationState(): Promise<MigrationState> {
    const statePath = this.getMigrationStatePath()
    try {
      const content = await fs.readFile(statePath, 'utf-8')
      const state = JSON.parse(content) as MigrationState
      if (typeof state.lastMigratedVersion === 'string') {
        return state
      }
    } catch {
      // File doesn't exist or invalid - use default
      logger.debug(`[VersionMigrationManager] Migration state not found, using default version: ${this.DEFAULT_VERSION}`)
    }
    return {
      lastMigratedVersion: this.DEFAULT_VERSION,
      migratedAt: new Date().toISOString(),
    }
  }

  // Load last migrated version from state file
  // Returns DEFAULT_VERSION if file missing/invalid
  async loadMigrationState(): Promise<string> {
    const state = await this.loadFullMigrationState()
    return state.lastMigratedVersion
  }

  // Save current version to state file, preserving and appending to existing failures
  async saveMigrationState(version: string, newFailures: FailedMigration[] = []): Promise<void> {
    const statePath = this.getMigrationStatePath()
    try {
      await fs.ensureDir(path.dirname(statePath))

      // Load existing state to preserve accumulated failures
      const existingState = await this.loadFullMigrationState()
      const existingFailures = existingState.failedMigrations ?? []

      // Merge failures: keep existing ones, add new ones (avoid duplicates by version)
      const allFailures = [...existingFailures]
      for (const newFailure of newFailures) {
        // Replace if same version already exists, otherwise append
        const existingIndex = allFailures.findIndex(f => f.version === newFailure.version)
        if (existingIndex >= 0) {
          allFailures[existingIndex] = newFailure
        } else {
          allFailures.push(newFailure)
        }
      }

      const state: MigrationState = {
        lastMigratedVersion: version,
        migratedAt: new Date().toISOString(),
        ...(allFailures.length > 0 && { failedMigrations: allFailures }),
      }
      await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8')
    } catch (error) {
      logger.warn(`[VersionMigrationManager] Failed to save migration state: ${error}`)
    }
  }

  // Compare semver versions: returns negative if v1 < v2, positive if v1 > v2, 0 if equal
  // Pattern from update-notifier.ts:190-221
  compareVersions(v1: string, v2: string): number {
    try {
      const parts1 = v1.split('.').map(p => parseInt(p, 10))
      const parts2 = v2.split('.').map(p => parseInt(p, 10))

      for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const p1 = parts1[i] ?? 0
        const p2 = parts2[i] ?? 0
        if (p1 !== p2) return p1 - p2
      }
      return 0
    } catch {
      return 0
    }
  }

  // Get migrations that need to run (version > lastMigrated, version <= current)
  getPendingMigrations(lastMigratedVersion: string, currentVersion: string): Migration[] {
    return migrations
      .filter(
        m =>
          this.compareVersions(m.version, lastMigratedVersion) > 0 &&
          this.compareVersions(m.version, currentVersion) <= 0
      )
      .sort((a, b) => this.compareVersions(a.version, b.version))
  }

  // Main entry point - run any pending migrations
  // packageVersion is the version from package.json; may be overridden by ILOOM_VERSION_OVERRIDE
  async runMigrationsIfNeeded(packageVersion: string): Promise<void> {
    const currentVersion = this.getEffectiveVersion(packageVersion)
    const lastMigratedVersion = await this.loadMigrationState()

    // Skip if already at or beyond current version
    if (this.compareVersions(lastMigratedVersion, currentVersion) >= 0) {
      return
    }

    const pending = this.getPendingMigrations(lastMigratedVersion, currentVersion)

    if (pending.length === 0) {
      // No migrations but version changed - update state
      logger.debug(`[VersionMigrationManager] No migrations to run, updating state to ${currentVersion}`)
      await this.saveMigrationState(currentVersion)
      return
    }

    // Run migrations in order, tracking failures
    const failedMigrations: FailedMigration[] = []
    for (const migration of pending) {
      logger.debug(`[VersionMigrationManager] Running migration to ${migration.version}: ${migration.description}`)
      try {
        await migration.migrate()
        logger.debug(`[VersionMigrationManager] Migration to ${migration.version} completed`)
      } catch (error) {
        // Log error but continue - migrations should be idempotent
        logger.warn(`[VersionMigrationManager] Migration to ${migration.version} failed: ${error}`)
        failedMigrations.push({
          version: migration.version,
          description: migration.description,
          failedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // Update state to current version, including failure info
    await this.saveMigrationState(currentVersion, failedMigrations)
  }
}
