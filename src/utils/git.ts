import path from 'path'
import { execa } from 'execa'
import { type GitWorktree, type WorktreeOperationResult } from '../types/worktree.js'

/**
 * Execute a Git command and return the result
 */
export async function executeGitCommand(
  args: string[],
  options?: { cwd?: string; timeout?: number }
): Promise<WorktreeOperationResult> {
  try {
    const result = await execa('git', args, {
      cwd: options?.cwd ?? process.cwd(),
      timeout: options?.timeout ?? 30000,
      encoding: 'utf8',
    })

    return {
      success: true,
      message: result.stdout,
      exitCode: result.exitCode ?? 0,
    }
  } catch (error) {
    const execaError = error as {
      stdout?: string
      stderr?: string
      message?: string
      exitCode?: number
    }
    return {
      success: false,
      message: execaError.stdout ?? '',
      error: execaError.stderr ?? execaError.message ?? 'Unknown Git error',
      exitCode: execaError.exitCode ?? 1,
    }
  }
}

/**
 * Parse git worktree list output into structured data
 */
export function parseWorktreeList(output: string): GitWorktree[] {
  const worktrees: GitWorktree[] = []
  const lines = output.trim().split('\n').filter(Boolean)

  for (let i = 0; i < lines.length; i += 3) {
    const pathLine = lines[i]
    const commitLine = lines[i + 1]
    const branchLine = lines[i + 2]

    if (!pathLine || !commitLine) continue

    // Parse path line: "worktree /path/to/worktree"
    const pathMatch = pathLine.match(/^worktree (.+)$/)
    if (!pathMatch) continue

    // Parse commit line: "HEAD abc123def456 commit message"
    const commitMatch = commitLine.match(/^HEAD ([a-f0-9]+)/)
    if (!commitMatch) continue

    // Parse branch line: "branch refs/heads/feature-branch" or "detached"
    let branch = ''
    let detached = false
    let bare = false
    let locked = false
    let lockReason: string | undefined

    if (branchLine) {
      if (branchLine === 'detached') {
        detached = true
        branch = 'HEAD'
      } else if (branchLine === 'bare') {
        bare = true
        branch = 'main' // Default assumption for bare repo
      } else if (branchLine.startsWith('locked')) {
        locked = true
        const lockMatch = branchLine.match(/^locked (.+)$/)
        lockReason = lockMatch?.[1]
        // Try to get branch from previous context or default
        branch = 'unknown'
      } else {
        const branchMatch = branchLine.match(/^branch refs\/heads\/(.+)$/)
        branch = branchMatch?.[1] ?? branchLine
      }
    }

    const worktree: GitWorktree = {
      path: pathMatch[1] ?? '',
      branch,
      commit: commitMatch[1] ?? '',
      bare,
      detached,
      locked,
    }

    if (lockReason !== undefined) {
      worktree.lockReason = lockReason
    }

    worktrees.push(worktree)
  }

  return worktrees
}

/**
 * Check if a branch name follows PR naming patterns
 */
export function isPRBranch(branchName: string): boolean {
  const prPatterns = [
    /^pr\/\d+/i, // pr/123, pr/123-feature-name
    /^pull\/\d+/i, // pull/123
    /^\d+[-_]/, // 123-feature-name, 123_feature_name
    /^feature\/pr[-_]?\d+/i, // feature/pr123, feature/pr-123
    /^hotfix\/pr[-_]?\d+/i, // hotfix/pr123
  ]

  return prPatterns.some(pattern => pattern.test(branchName))
}

/**
 * Extract PR number from branch name
 */
export function extractPRNumber(branchName: string): number | null {
  const patterns = [
    /^pr\/(\d+)/i, // pr/123
    /^pull\/(\d+)/i, // pull/123
    /^(\d+)[-_]/, // 123-feature-name
    /^feature\/pr[-_]?(\d+)/i, // feature/pr123
    /^hotfix\/pr[-_]?(\d+)/i, // hotfix/pr123
    /pr[-_]?(\d+)/i, // anywhere with pr123 or pr-123
  ]

  for (const pattern of patterns) {
    const match = branchName.match(pattern)
    if (match?.[1]) {
      const num = parseInt(match[1], 10)
      if (!isNaN(num)) return num
    }
  }

  return null
}

/**
 * Check if a path follows worktree naming patterns
 */
export function isWorktreePath(path: string): boolean {
  const worktreePatterns = [
    /\/worktrees?\//i, // Contains /worktree/ or /worktrees/
    /\/workspace[-_]?\d+/i, // workspace123, workspace-123
    /\/issue[-_]?\d+/i, // issue123, issue-123
    /\/pr[-_]?\d+/i, // pr123, pr-123
    /-worktree$/i, // ends with -worktree
    /\.worktree$/i, // ends with .worktree
  ]

  return worktreePatterns.some(pattern => pattern.test(path))
}

/**
 * Generate a worktree path based on branch name and root directory
 */
export function generateWorktreePath(branchName: string, rootDir: string = process.cwd()): string {
  // Sanitize branch name for filesystem
  const sanitized = branchName
    .replace(/[^a-zA-Z0-9\-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()

  const parentDir = path.dirname(rootDir)
  return path.join(parentDir, `worktree-${sanitized}`)
}

/**
 * Validate that a directory is a valid Git repository
 */
export async function isValidGitRepo(path: string): Promise<boolean> {
  try {
    const result = await executeGitCommand(['rev-parse', '--git-dir'], { cwd: path })
    return result.success
  } catch {
    return false
  }
}

/**
 * Get the current branch name for a repository
 */
export async function getCurrentBranch(path: string = process.cwd()): Promise<string | null> {
  try {
    const result = await executeGitCommand(['branch', '--show-current'], { cwd: path })
    return result.success ? result.message.trim() : null
  } catch {
    return null
  }
}

/**
 * Check if a branch exists (local or remote)
 */
export async function branchExists(
  branchName: string,
  path: string = process.cwd(),
  includeRemote = true
): Promise<boolean> {
  try {
    // Check local branches
    const localResult = await executeGitCommand(['branch', '--list', branchName], { cwd: path })
    if (localResult.success && localResult.message.trim()) {
      return true
    }

    // Check remote branches if requested
    if (includeRemote) {
      const remoteResult = await executeGitCommand(['branch', '-r', '--list', `*/${branchName}`], {
        cwd: path,
      })
      if (remoteResult.success && remoteResult.message.trim()) {
        return true
      }
    }

    return false
  } catch {
    return false
  }
}

/**
 * Get repository root directory
 */
export async function getRepoRoot(path: string = process.cwd()): Promise<string | null> {
  try {
    const result = await executeGitCommand(['rev-parse', '--show-toplevel'], { cwd: path })
    return result.success ? result.message.trim() : null
  } catch {
    return null
  }
}

/**
 * Check if there are uncommitted changes in a repository
 */
export async function hasUncommittedChanges(path: string = process.cwd()): Promise<boolean> {
  try {
    const result = await executeGitCommand(['status', '--porcelain'], { cwd: path })
    return result.success && result.message.trim().length > 0
  } catch {
    return false
  }
}

/**
 * Get the default branch name for a repository
 */
export async function getDefaultBranch(path: string = process.cwd()): Promise<string> {
  try {
    // Try to get from remote
    const remoteResult = await executeGitCommand(['symbolic-ref', 'refs/remotes/origin/HEAD'], {
      cwd: path,
    })
    if (remoteResult.success) {
      const match = remoteResult.message.match(/refs\/remotes\/origin\/(.+)/)
      if (match) return match[1] ?? 'main'
    }

    // Fallback to common default branch names
    const commonDefaults = ['main', 'master', 'develop']
    for (const branch of commonDefaults) {
      if (await branchExists(branch, path)) {
        return branch
      }
    }

    return 'main' // Final fallback
  } catch {
    return 'main'
  }
}
