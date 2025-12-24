import path from 'path'
import os from 'os'
import fs from 'fs-extra'
import { getLogger } from '../utils/logger-context.js'
import { MetadataManager, type LoomMetadata } from '../lib/MetadataManager.js'

/**
 * Project marker file structure (from FirstRunManager)
 */
interface ProjectMarker {
  configuredAt: string
  projectPath: string
  projectName: string
}

/**
 * Output schema for project
 */
export interface ProjectOutput {
  configuredAt: string
  projectPath: string
  projectName: string
  activeLooms: number
}

/**
 * ProjectsCommand: List configured iloom projects
 *
 * Returns JSON array of configured projects from ~/.config/iloom-ai/projects/
 * Only includes projects where the directory still exists.
 * Each project includes an activeLooms count.
 */
export class ProjectsCommand {
  private readonly projectsDir: string
  private readonly metadataManager: MetadataManager

  constructor(metadataManager?: MetadataManager) {
    this.projectsDir = path.join(os.homedir(), '.config', 'iloom-ai', 'projects')
    this.metadataManager = metadataManager ?? new MetadataManager()
  }

  /**
   * Execute the projects command
   * @param _options - Options object (json flag accepted but ignored - always returns JSON)
   * @returns Array of project outputs
   */
  async execute(_options?: { json?: boolean }): Promise<ProjectOutput[]> {
    // Options.json is accepted but ignored - always returns structured data
    const results: ProjectOutput[] = []
    const logger = getLogger()

    try {
      // Check if projects directory exists
      if (!(await fs.pathExists(this.projectsDir))) {
        return results
      }

      // Read all files in projects directory
      const files = await fs.readdir(this.projectsDir)

      // Get all loom metadata for active looms lookup
      const allMetadata = await this.metadataManager.listAllMetadata()

      for (const file of files) {
        // Skip hidden files (like .DS_Store)
        if (file.startsWith('.')) continue

        try {
          const filePath = path.join(this.projectsDir, file)
          const content = await fs.readFile(filePath, 'utf8')
          const marker: ProjectMarker = JSON.parse(content)

          // Skip if required fields missing
          if (!marker.projectPath || !marker.projectName) continue

          // Filter: only include if directory exists
          if (!(await fs.pathExists(marker.projectPath))) continue

          // Count active looms for this project
          const activeLooms = await this.countActiveLooms(marker.projectPath, allMetadata)

          results.push({
            configuredAt: marker.configuredAt,
            projectPath: marker.projectPath,
            projectName: marker.projectName,
            activeLooms,
          })
        } catch {
          // Skip invalid files (graceful degradation)
          logger.debug(`Skipping invalid project file: ${file}`)
        }
      }
    } catch (error) {
      // Graceful degradation on read errors
      logger.debug(`Failed to list projects: ${error instanceof Error ? error.message : 'Unknown'}`)
    }

    return results
  }

  /**
   * Count active looms for a project
   * Looms are counted if their worktreePath is in the project's -looms directory
   * or if they share the same parent directory as the project.
   * Only counts looms where the worktree is a valid git worktree (.git exists).
   */
  private async countActiveLooms(projectPath: string, allMetadata: LoomMetadata[]): Promise<number> {
    let count = 0
    for (const meta of allMetadata) {
      if (!meta.worktreePath) continue
      const parentDir = path.dirname(meta.worktreePath)
      const isProjectLoom =
        parentDir === path.dirname(projectPath) ||
        parentDir.startsWith(projectPath + '-looms')
      // Check for .git (file for worktrees, directory for main repo) to verify it's a valid git worktree
      const isValidWorktree = await fs.pathExists(path.join(meta.worktreePath, '.git'))
      if (isProjectLoom && isValidWorktree) {
        count++
      }
    }
    return count
  }
}
