import path from 'path'
import os from 'os'
import fs from 'fs-extra'
import { logger } from '../utils/logger.js'

/**
 * Schema for metadata JSON file
 * Stored in ~/.config/iloom-ai/looms/
 */
export interface MetadataFile {
  description: string
  created_at?: string
  version: number
  // Additional metadata fields (v2)
  branchName?: string
  worktreePath?: string
  issueType?: 'branch' | 'issue' | 'pr'
  issue_numbers?: string[]
  pr_numbers?: string[]
  issueTracker?: string
}

/**
 * Input for writing metadata (all fields except version and created_at)
 * Note: issueTracker is required because every loom should have an associated
 * issue tracker provider (defaults to 'github' via IssueTrackerFactory)
 */
export interface WriteMetadataInput {
  description: string
  branchName: string
  worktreePath: string
  issueType: 'branch' | 'issue' | 'pr'
  issue_numbers: string[]
  pr_numbers: string[]
  issueTracker: string
}

/**
 * Result of reading metadata for a worktree
 */
export interface LoomMetadata {
  description: string
  created_at: string | null
  branchName: string | null
  worktreePath: string | null
  issueType: 'branch' | 'issue' | 'pr' | null
  issue_numbers: string[]
  pr_numbers: string[]
  issueTracker: string | null
}

/**
 * MetadataManager: Manage loom metadata persistence
 *
 * Stores loom metadata in ~/.config/iloom-ai/looms/ directory.
 * Each worktree gets a JSON file named by slugifying its absolute path.
 *
 * Per spec section 2.2:
 * - Filename derived from worktree absolute path
 * - Path separators replaced with double underscores
 * - Non-alphanumeric chars (except _ and -) replaced with hyphens
 */
export class MetadataManager {
  private readonly loomsDir: string

  constructor() {
    this.loomsDir = path.join(os.homedir(), '.config', 'iloom-ai', 'looms')
  }

  /**
   * Convert worktree path to filename slug per spec section 2.2
   *
   * Algorithm:
   * 1. Trim trailing slashes
   * 2. Replace all path separators (/ or \) with __ (double underscore)
   * 3. Replace any other non-alphanumeric characters (except _ and -) with -
   * 4. Append .json
   *
   * Example:
   * - Worktree: /Users/jane/dev/repo
   * - Filename: _Users__jane__dev__repo.json
   */
  slugifyPath(worktreePath: string): string {
    // 1. Trim trailing slashes
    let slug = worktreePath.replace(/[/\\]+$/, '')

    // 2. Replace path separators with double underscores
    slug = slug.replace(/[/\\]/g, '___')

    // 3. Replace non-alphanumeric chars (except _ and -) with hyphens
    slug = slug.replace(/[^a-zA-Z0-9_-]/g, '-')

    // 4. Append .json
    return `${slug}.json`
  }

  /**
   * Get the full path to the metadata file for a worktree
   */
  private getFilePath(worktreePath: string): string {
    const filename = this.slugifyPath(worktreePath)
    return path.join(this.loomsDir, filename)
  }

  /**
   * Write metadata for a worktree (spec section 3.1)
   *
   * @param worktreePath - Absolute path to the worktree (used for file naming)
   * @param input - Metadata to write (description plus additional fields)
   */
  async writeMetadata(worktreePath: string, input: WriteMetadataInput): Promise<void> {
    try {
      // 1. Ensure looms directory exists
      await fs.ensureDir(this.loomsDir, { mode: 0o755 })

      // 2. Create JSON content
      const content: MetadataFile = {
        description: input.description,
        created_at: new Date().toISOString(),
        version: 1,
        branchName: input.branchName,
        worktreePath: input.worktreePath,
        issueType: input.issueType,
        issue_numbers: input.issue_numbers,
        pr_numbers: input.pr_numbers,
        issueTracker: input.issueTracker,
      }

      // 3. Write to slugified filename
      const filePath = this.getFilePath(worktreePath)
      await fs.writeFile(filePath, JSON.stringify(content, null, 2), { mode: 0o644 })

      logger.debug(`Metadata written for worktree: ${worktreePath}`)
    } catch (error) {
      // Log warning but don't throw - metadata is supplementary
      logger.warn(
        `Failed to write metadata for worktree: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Read metadata for a worktree (spec section 3.2)
   *
   * @param worktreePath - Absolute path to the worktree
   * @returns The metadata object with all fields, or null if not found/invalid
   */
  async readMetadata(worktreePath: string): Promise<LoomMetadata | null> {
    try {
      const filePath = this.getFilePath(worktreePath)

      // Check if file exists
      if (!(await fs.pathExists(filePath))) {
        return null
      }

      // Read and parse JSON
      const content = await fs.readFile(filePath, 'utf8')
      const data: MetadataFile = JSON.parse(content)

      if (!data.description) {
        return null
      }

      return {
        description: data.description,
        created_at: data.created_at ?? null,
        branchName: data.branchName ?? null,
        worktreePath: data.worktreePath ?? null,
        issueType: data.issueType ?? null,
        issue_numbers: data.issue_numbers ?? [],
        pr_numbers: data.pr_numbers ?? [],
        issueTracker: data.issueTracker ?? null,
      }
    } catch (error) {
      // Return null on any error (graceful degradation per spec)
      logger.debug(
        `Could not read metadata for worktree ${worktreePath}: ${error instanceof Error ? error.message : String(error)}`
      )
      return null
    }
  }

  /**
   * Delete metadata for a worktree (spec section 3.3)
   *
   * Idempotent: silently succeeds if file doesn't exist
   * Non-fatal: logs warning on permission errors but doesn't throw
   *
   * @param worktreePath - Absolute path to the worktree
   */
  async deleteMetadata(worktreePath: string): Promise<void> {
    try {
      const filePath = this.getFilePath(worktreePath)

      // Check if file exists - silently return if not
      if (!(await fs.pathExists(filePath))) {
        logger.debug(`No metadata file to delete for worktree: ${worktreePath}`)
        return
      }

      // Delete the file
      await fs.unlink(filePath)
      logger.debug(`Metadata deleted for worktree: ${worktreePath}`)
    } catch (error) {
      // Log warning on permission error but don't throw (per spec section 3.3)
      logger.warn(
        `Failed to delete metadata for worktree: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}
