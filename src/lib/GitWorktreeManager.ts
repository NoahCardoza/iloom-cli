import path from 'path'
import fs from 'fs-extra'
import {
  type GitWorktree,
  type WorktreeCreateOptions,
  type WorktreeListOptions,
  type WorktreeOperationResult,
  type WorktreeValidation,
  type WorktreeStatus,
  type WorktreeCleanupOptions,
} from '../types/worktree.js'
import {
  executeGitCommand,
  parseWorktreeList,
  isPRBranch,
  extractPRNumber,
  generateWorktreePath,
  isValidGitRepo,
  getCurrentBranch,
  getRepoRoot,
  hasUncommittedChanges,
  getDefaultBranch,
} from '../utils/git.js'

/**
 * Manages Git worktrees for the Hatchbox AI CLI
 * Ports functionality from bash scripts into TypeScript
 */
export class GitWorktreeManager {
  private readonly repoPath: string

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath
  }

  /**
   * List all worktrees in the repository
   * Equivalent to: git worktree list --porcelain
   */
  async listWorktrees(options: WorktreeListOptions = {}): Promise<GitWorktree[]> {
    const args = ['worktree', 'list']
    if (options.porcelain) args.push('--porcelain')
    if (options.verbose) args.push('-v')

    const result = await executeGitCommand(args, { cwd: this.repoPath })
    if (!result.success) {
      throw new Error(`Failed to list worktrees: ${result.error}`)
    }

    return parseWorktreeList(result.message)
  }

  /**
   * Find worktree for a specific branch
   * Ports: find_worktree_for_branch() from find-worktree-for-branch.sh
   */
  async findWorktreeForBranch(branchName: string): Promise<GitWorktree | null> {
    const worktrees = await this.listWorktrees()
    return worktrees.find(wt => wt.branch === branchName) ?? null
  }

  /**
   * Check if a worktree is a PR worktree based on naming patterns
   * Ports: is_pr_worktree() from worktree-utils.sh
   */
  isPRWorktree(worktree: GitWorktree): boolean {
    return isPRBranch(worktree.branch)
  }

  /**
   * Get PR number from worktree branch name
   * Ports: get_pr_number_from_worktree() from worktree-utils.sh
   */
  getPRNumberFromWorktree(worktree: GitWorktree): number | null {
    return extractPRNumber(worktree.branch)
  }

  /**
   * Create a new worktree
   * Ports worktree creation logic from new-branch-workflow.sh
   */
  async createWorktree(options: WorktreeCreateOptions): Promise<WorktreeOperationResult> {
    // Validate inputs
    if (!options.branch) {
      return {
        success: false,
        message: '',
        error: 'Branch name is required',
        exitCode: 1,
      }
    }

    // Ensure path is absolute
    const absolutePath = path.resolve(options.path)

    // Check if path already exists and handle force flag
    if (await fs.pathExists(absolutePath)) {
      if (!options.force) {
        return {
          success: false,
          message: '',
          error: `Path already exists: ${absolutePath}`,
          exitCode: 1,
        }
      }
      // Remove existing directory if force is true
      await fs.remove(absolutePath)
    }

    // Build git worktree add command
    const args = ['worktree', 'add']

    if (options.createBranch) {
      args.push('-b', options.branch)
    }

    if (options.force) {
      args.push('--force')
    }

    args.push(absolutePath)

    // Add branch name if not creating new branch
    if (!options.createBranch) {
      args.push(options.branch)
    } else if (options.baseBranch) {
      args.push(options.baseBranch)
    }

    return await executeGitCommand(args, { cwd: this.repoPath })
  }

  /**
   * Remove a worktree and optionally clean up associated files
   * Ports worktree removal logic from cleanup-worktree.sh
   */
  async removeWorktree(
    worktreePath: string,
    options: WorktreeCleanupOptions = {}
  ): Promise<WorktreeOperationResult> {
    // Validate worktree exists
    const worktrees = await this.listWorktrees()
    const worktree = worktrees.find(wt => wt.path === worktreePath)

    if (!worktree) {
      return {
        success: false,
        message: '',
        error: `Worktree not found: ${worktreePath}`,
        exitCode: 1,
      }
    }

    // Check for uncommitted changes unless force is specified
    if (!options.force && !options.dryRun) {
      const hasChanges = await hasUncommittedChanges(worktreePath)
      if (hasChanges) {
        return {
          success: false,
          message: '',
          error: `Worktree has uncommitted changes: ${worktreePath}. Use --force to override.`,
          exitCode: 1,
        }
      }
    }

    if (options.dryRun) {
      const actions = ['Remove worktree registration']
      if (options.removeDirectory) actions.push('Remove directory from disk')
      if (options.removeBranch) actions.push(`Remove branch: ${worktree.branch}`)

      return {
        success: true,
        message: `Would perform: ${actions.join(', ')}`,
        exitCode: 0,
      }
    }

    // Remove worktree registration
    const args = ['worktree', 'remove']
    if (options.force) args.push('--force')
    args.push(worktreePath)

    const result = await executeGitCommand(args, { cwd: this.repoPath })

    // Remove directory if requested and command succeeded
    if (result.success && options.removeDirectory && (await fs.pathExists(worktreePath))) {
      await fs.remove(worktreePath)
    }

    // Remove branch if requested and safe to do so
    if (result.success && options.removeBranch && !worktree.bare) {
      const branchResult = await executeGitCommand(['branch', '-D', worktree.branch], {
        cwd: this.repoPath,
      })
      if (!branchResult.success) {
        // Don't fail the whole operation if branch deletion fails
        result.message += `\nWarning: Could not delete branch ${worktree.branch}: ${branchResult.error}`
      }
    }

    return result
  }

  /**
   * Validate worktree state and integrity
   */
  async validateWorktree(worktreePath: string): Promise<WorktreeValidation> {
    const issues: string[] = []
    let existsOnDisk = false
    let isValidRepo = false
    let hasValidBranch = false

    try {
      // Check if path exists on disk
      existsOnDisk = await fs.pathExists(worktreePath)
      if (!existsOnDisk) {
        issues.push('Worktree directory does not exist on disk')
      }

      // Check if it's a valid Git repository
      if (existsOnDisk) {
        isValidRepo = await isValidGitRepo(worktreePath)
        if (!isValidRepo) {
          issues.push('Directory is not a valid Git repository')
        }
      }

      // Check if branch reference is valid
      if (isValidRepo) {
        const currentBranch = await getCurrentBranch(worktreePath)
        hasValidBranch = currentBranch !== null
        if (!hasValidBranch) {
          issues.push('Could not determine current branch')
        }
      }

      // Check if worktree is registered with Git
      const worktrees = await this.listWorktrees()
      const isRegistered = worktrees.some(wt => wt.path === worktreePath)
      if (!isRegistered) {
        issues.push('Worktree is not registered with Git')
      }
    } catch (error) {
      issues.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    return {
      isValid: issues.length === 0,
      issues,
      existsOnDisk,
      isValidRepo,
      hasValidBranch,
    }
  }

  /**
   * Get detailed status information for a worktree
   */
  async getWorktreeStatus(worktreePath: string): Promise<WorktreeStatus> {
    const statusResult = await executeGitCommand(['status', '--porcelain=v1'], {
      cwd: worktreePath,
    })

    let modified = 0
    let staged = 0
    let deleted = 0
    let untracked = 0

    if (statusResult.success) {
      const lines = statusResult.message.trim().split('\n').filter(Boolean)
      for (const line of lines) {
        const status = line.substring(0, 2)
        if (status[0] === 'M' || status[1] === 'M') modified++
        if (status[0] === 'A' || status[0] === 'D' || status[0] === 'R') staged++
        if (status[0] === 'D' || status[1] === 'D') deleted++
        if (status === '??') untracked++
      }
    }

    const currentBranch = (await getCurrentBranch(worktreePath)) ?? 'unknown'
    const detached = currentBranch === 'unknown'

    // Get ahead/behind information
    let ahead = 0
    let behind = 0
    try {
      const aheadBehindResult = await executeGitCommand(
        ['rev-list', '--left-right', '--count', `origin/${currentBranch}...HEAD`],
        { cwd: worktreePath }
      )
      if (aheadBehindResult.success) {
        const parts = aheadBehindResult.message.trim().split('\t')
        const behindStr = parts[0]
        const aheadStr = parts[1]
        behind = behindStr ? parseInt(behindStr, 10) || 0 : 0
        ahead = aheadStr ? parseInt(aheadStr, 10) || 0 : 0
      }
    } catch {
      // Ignore errors for ahead/behind calculation
    }

    return {
      modified,
      staged,
      deleted,
      untracked,
      hasChanges: modified + staged + deleted + untracked > 0,
      branch: currentBranch,
      detached,
      ahead,
      behind,
    }
  }

  /**
   * Generate a suggested worktree path for a branch
   */
  generateWorktreePath(branchName: string, customRoot?: string): string {
    const root = customRoot ?? this.repoPath
    return generateWorktreePath(branchName, root)
  }

  /**
   * Check if repository is in a valid state for worktree operations
   */
  async isRepoReady(): Promise<boolean> {
    try {
      const repoRoot = await getRepoRoot(this.repoPath)
      return repoRoot !== null
    } catch {
      return false
    }
  }

  /**
   * Get repository information
   */
  async getRepoInfo(): Promise<{
    root: string | null
    defaultBranch: string
    currentBranch: string | null
  }> {
    const root = await getRepoRoot(this.repoPath)
    const defaultBranch = await getDefaultBranch(this.repoPath)
    const currentBranch = await getCurrentBranch(this.repoPath)

    return {
      root,
      defaultBranch,
      currentBranch,
    }
  }

  /**
   * Prune stale worktree entries (worktrees that no longer exist on disk)
   */
  async pruneWorktrees(): Promise<WorktreeOperationResult> {
    return await executeGitCommand(['worktree', 'prune', '-v'], { cwd: this.repoPath })
  }

  /**
   * Lock a worktree to prevent it from being pruned or moved
   */
  async lockWorktree(worktreePath: string, reason?: string): Promise<WorktreeOperationResult> {
    const args = ['worktree', 'lock', worktreePath]
    if (reason) args.push('--reason', reason)

    return await executeGitCommand(args, { cwd: this.repoPath })
  }

  /**
   * Unlock a previously locked worktree
   */
  async unlockWorktree(worktreePath: string): Promise<WorktreeOperationResult> {
    return await executeGitCommand(['worktree', 'unlock', worktreePath], { cwd: this.repoPath })
  }
}
