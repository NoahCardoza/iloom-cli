import { readPackageJson, parseBinField, hasWebDependencies } from '../utils/package-json.js'
import type { ProjectCapability } from '../types/hatchbox.js'

export interface ProjectCapabilities {
  capabilities: ProjectCapability[]
  binEntries: Record<string, string>
}

export class ProjectCapabilityDetector {
  /**
   * Detect project capabilities by analyzing package.json
   * @param worktreePath Path to the worktree directory
   * @returns Project capabilities and bin entries
   */
  async detectCapabilities(worktreePath: string): Promise<ProjectCapabilities> {
    const pkgJson = await readPackageJson(worktreePath)
    const capabilities: ProjectCapability[] = []

    // CLI detection: has bin field
    if (pkgJson.bin) {
      capabilities.push('cli')
    }

    // Web detection: has web framework dependencies
    if (hasWebDependencies(pkgJson)) {
      capabilities.push('web')
    }

    // Parse bin entries for CLI projects
    const binEntries = pkgJson.bin ? parseBinField(pkgJson.bin, pkgJson.name) : {}

    return { capabilities, binEntries }
  }
}
