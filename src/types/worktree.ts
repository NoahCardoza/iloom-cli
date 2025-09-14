/**
 * Represents a Git worktree with all relevant metadata
 */
export interface GitWorktree {
  /** Absolute path to the worktree directory */
  path: string
  /** Branch name associated with the worktree */
  branch: string
  /** Current commit SHA */
  commit: string
  /** Whether this is the main worktree */
  bare: boolean
  /** Whether this is a detached HEAD state */
  detached: boolean
  /** Whether this worktree is locked */
  locked: boolean
  /** Reason for lock if locked */
  lockReason?: string
}

/**
 * Configuration for creating a new worktree
 */
export interface WorktreeCreateOptions {
  /** Path where worktree should be created */
  path: string
  /** Branch name to checkout/create */
  branch: string
  /** Base branch to branch from (defaults to current branch) */
  baseBranch?: string
  /** Whether to create a new branch */
  createBranch?: boolean
  /** Whether to force creation (overwrite existing) */
  force?: boolean
}

/**
 * Options for listing worktrees
 */
export interface WorktreeListOptions {
  /** Include porcelain output format */
  porcelain?: boolean
  /** Include verbose information */
  verbose?: boolean
}

/**
 * Result of a worktree operation
 */
export interface WorktreeOperationResult {
  /** Whether the operation was successful */
  success: boolean
  /** Output message from Git command */
  message: string
  /** Error message if operation failed */
  error?: string
  /** Exit code from Git command */
  exitCode: number
}

/**
 * Pattern matching for PR worktrees based on naming conventions
 */
export interface PRWorktreePattern {
  /** Regex pattern to match PR branch names */
  branchPattern: RegExp
  /** Regex pattern to match PR worktree paths */
  pathPattern: RegExp
  /** Function to extract PR number from branch name */
  extractPRNumber: (branchName: string) => number | null
}

/**
 * Worktree validation result
 */
export interface WorktreeValidation {
  /** Whether the worktree is valid */
  isValid: boolean
  /** List of validation issues found */
  issues: string[]
  /** Whether the worktree exists on disk */
  existsOnDisk: boolean
  /** Whether the Git repository is valid */
  isValidRepo: boolean
  /** Whether the branch reference is valid */
  hasValidBranch: boolean
}

/**
 * Git worktree status information
 */
export interface WorktreeStatus {
  /** Number of modified files */
  modified: number
  /** Number of added/staged files */
  staged: number
  /** Number of deleted files */
  deleted: number
  /** Number of untracked files */
  untracked: number
  /** Whether there are uncommitted changes */
  hasChanges: boolean
  /** Current branch name */
  branch: string
  /** Whether in detached HEAD state */
  detached: boolean
  /** Commits ahead of upstream */
  ahead: number
  /** Commits behind upstream */
  behind: number
}

/**
 * Worktree cleanup options
 */
export interface WorktreeCleanupOptions {
  /** Remove worktree directory from disk */
  removeDirectory?: boolean
  /** Force removal even with uncommitted changes */
  force?: boolean
  /** Remove associated branch if safe */
  removeBranch?: boolean
  /** Dry run - show what would be done */
  dryRun?: boolean
}
