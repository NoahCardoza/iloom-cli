import type { DatabaseProvider } from '../types/index.js'
import { EnvironmentManager } from './EnvironmentManager.js'
import { createLogger } from '../utils/logger.js'

const logger = createLogger({ prefix: '🗂️' })

/**
 * Database Manager - orchestrates database operations with conditional execution
 * Ports functionality from bash scripts with guard conditions:
 *   1. Database provider must be properly configured (provider.isConfigured())
 *   2. The worktree's .env file must contain DATABASE_URL or DATABASE_URI
 *
 * This ensures database branching only occurs for projects that actually use databases
 */
export class DatabaseManager {
  constructor(
    private provider: DatabaseProvider,
    private environment: EnvironmentManager
  ) {}

  /**
   * Check if database branching should be used
   * Requires BOTH conditions:
   *   1. Database provider is properly configured (checked via provider.isConfigured())
   *   2. .env file contains DATABASE_URL or DATABASE_URI
   */
  async shouldUseDatabaseBranching(envFilePath: string): Promise<boolean> {
    // Check for provider configuration
    if (!this.provider.isConfigured()) {
      logger.debug('Skipping database branching: Database provider not configured')
      return false
    }

    // Check if .env has DATABASE_URL or DATABASE_URI
    const hasDatabaseUrl = await this.hasDatabaseUrlInEnv(envFilePath)
    if (!hasDatabaseUrl) {
      logger.debug(
        'Skipping database branching: DATABASE_URL/DATABASE_URI not found in .env file'
      )
      return false
    }

    return true
  }

  /**
   * Create database branch only if configured
   * Returns connection string if branch was created, null if skipped
   */
  async createBranchIfConfigured(
    branchName: string,
    envFilePath: string
  ): Promise<string | null> {
    // Guard condition: check if database branching should be used
    if (!(await this.shouldUseDatabaseBranching(envFilePath))) {
      return null
    }

    // Check CLI availability and authentication
    if (!(await this.provider.isCliAvailable())) {
      logger.warn('Skipping database branch creation: Neon CLI not available')
      logger.warn('Install with: npm install -g neonctl')
      return null
    }

    if (!(await this.provider.isAuthenticated())) {
      logger.warn('Skipping database branch creation: Not authenticated with Neon CLI')
      logger.warn('Run: neon auth')
      return null
    }

    try {
      // Create the branch (which checks for preview first)
      const connectionString = await this.provider.createBranch(branchName)
      logger.success(`Database branch ready: ${this.provider.sanitizeBranchName(branchName)}`)
      return connectionString
    } catch (error) {
      logger.error(
        `Failed to create database branch: ${error instanceof Error ? error.message : String(error)}`
      )
      throw error
    }
  }

  /**
   * Delete database branch only if configured
   */
  async deleteBranchIfConfigured(
    branchName: string,
    envFilePath?: string,
    isPreview: boolean = false
  ): Promise<void> {
    // Guard condition: check if database branching should be used
    // If no envFilePath provided, skip the env file check (pre-determined config)
    if (envFilePath && !(await this.shouldUseDatabaseBranching(envFilePath))) {
      return
    }

    // If no envFilePath, check provider configuration directly
    if (!envFilePath && !this.provider.isConfigured()) {
      logger.debug('Skipping database branch deletion: Database provider not configured')
      return
    }

    // Check CLI availability and authentication
    if (!(await this.provider.isCliAvailable())) {
      logger.debug('Skipping database branch deletion: Neon CLI not available')
      return
    }

    if (!(await this.provider.isAuthenticated())) {
      logger.debug('Skipping database branch deletion: Not authenticated with Neon CLI')
      return
    }

    try {
      await this.provider.deleteBranch(branchName, isPreview)
    } catch (error) {
      // Log warning but don't throw - matches bash script behavior
      logger.warn(
        `Failed to delete database branch: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Check if .env has DATABASE_URL or DATABASE_URI
   */
  private async hasDatabaseUrlInEnv(envFilePath: string): Promise<boolean> {
    try {
      const envMap = await this.environment.readEnvFile(envFilePath)
      return envMap.has('DATABASE_URL') || envMap.has('DATABASE_URI')
    } catch {
      return false
    }
  }
}
