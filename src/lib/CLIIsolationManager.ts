import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import { runScript } from '../utils/package-manager.js'
import { readPackageJson, hasScript } from '../utils/package-json.js'
import { logger } from '../utils/logger.js'

export class CLIIsolationManager {
  private readonly hatchboxBinDir: string

  constructor() {
    this.hatchboxBinDir = path.join(os.homedir(), '.hatchbox', 'bin')
  }

  /**
   * Setup CLI isolation for a worktree
   * - Build the project
   * - Create versioned symlinks
   * - Check PATH configuration
   * @param worktreePath Path to the worktree
   * @param identifier Issue/PR number or branch identifier
   * @param binEntries Bin entries from package.json
   * @returns Array of created symlink names
   */
  async setupCLIIsolation(
    worktreePath: string,
    identifier: string | number,
    binEntries: Record<string, string>
  ): Promise<string[]> {
    // 1. Build the project
    await this.buildProject(worktreePath)

    // 2. Verify bin targets exist and are executable
    await this.verifyBinTargets(worktreePath, binEntries)

    // 3. Create ~/.hatchbox/bin if needed
    await fs.ensureDir(this.hatchboxBinDir)

    // 4. Create versioned symlinks
    const symlinkNames = await this.createVersionedSymlinks(
      worktreePath,
      identifier,
      binEntries
    )

    // 5. Check PATH and provide instructions if needed
    await this.ensureHatchboxBinInPath()

    return symlinkNames
  }

  /**
   * Build the project using package.json build script
   * @param worktreePath Path to the worktree
   */
  private async buildProject(worktreePath: string): Promise<void> {
    const pkgJson = await readPackageJson(worktreePath)

    if (!hasScript(pkgJson, 'build')) {
      logger.warn('No build script found in package.json - skipping build')
      return
    }

    logger.info('Building CLI tool...')
    await runScript('build', worktreePath)
    logger.success('Build completed')
  }

  /**
   * Verify bin targets exist and are executable
   * @param worktreePath Path to the worktree
   * @param binEntries Bin entries from package.json
   */
  private async verifyBinTargets(
    worktreePath: string,
    binEntries: Record<string, string>
  ): Promise<void> {
    for (const binPath of Object.values(binEntries)) {
      const targetPath = path.resolve(worktreePath, binPath)

      // Check if file exists
      const exists = await fs.pathExists(targetPath)
      if (!exists) {
        throw new Error(`Bin target does not exist: ${targetPath}`)
      }

      // Check if file is executable
      try {
        await fs.access(targetPath, fs.constants.X_OK)
      } catch {
        // File is not executable, but that's okay - symlink will work anyway
        // The shebang in the file will determine how it's executed
      }
    }
  }

  /**
   * Create versioned symlinks in ~/.hatchbox/bin
   * @param worktreePath Path to the worktree
   * @param identifier Issue/PR number or branch identifier
   * @param binEntries Bin entries from package.json
   * @returns Array of created symlink names
   */
  private async createVersionedSymlinks(
    worktreePath: string,
    identifier: string | number,
    binEntries: Record<string, string>
  ): Promise<string[]> {
    const symlinkNames: string[] = []

    for (const [binName, binPath] of Object.entries(binEntries)) {
      const versionedName = `${binName}-${identifier}`
      const targetPath = path.resolve(worktreePath, binPath)
      const symlinkPath = path.join(this.hatchboxBinDir, versionedName)

      // Create symlink
      await fs.symlink(targetPath, symlinkPath)

      logger.success(`CLI available: ${versionedName}`)
      symlinkNames.push(versionedName)
    }

    return symlinkNames
  }

  /**
   * Check if ~/.hatchbox/bin is in PATH and provide setup instructions
   */
  private async ensureHatchboxBinInPath(): Promise<void> {
    const currentPath = process.env.PATH ?? ''
    if (currentPath.includes('.hatchbox/bin')) {
      return // Already configured
    }

    // Detect shell and RC file
    const shell = this.detectShell()
    const rcFile = this.getShellRcFile(shell)

    // Print setup instructions
    logger.warn('\n⚠️  One-time PATH setup required:')
    logger.warn(`   Add to ${rcFile}:`)
    logger.warn(`   export PATH="$HOME/.hatchbox/bin:$PATH"`)
    logger.warn(`   Then run: source ${rcFile}\n`)
  }

  /**
   * Detect current shell
   * @returns Shell name (zsh, bash, fish, etc.)
   */
  private detectShell(): string {
    const shell = process.env.SHELL ?? ''
    return shell.split('/').pop() ?? 'bash'
  }

  /**
   * Get RC file path for shell
   * @param shell Shell name
   * @returns RC file path
   */
  private getShellRcFile(shell: string): string {
    const rcFiles: Record<string, string> = {
      zsh: '~/.zshrc',
      bash: '~/.bashrc',
      fish: '~/.config/fish/config.fish'
    }
    return rcFiles[shell] ?? '~/.bashrc'
  }
}
