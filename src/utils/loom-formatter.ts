import { extractIssueNumber } from './git.js'
import type { GitWorktree } from '../types/worktree.js'

/**
 * JSON output schema for il list --json
 */
export interface LoomJsonOutput {
  name: string
  worktreePath: string | null
  branch: string | null
  type: 'branch' | 'issue' | 'pr'
  issue_numbers: string[]
  pr_numbers: string[]
  isMainWorktree: boolean
}

/**
 * Determine loom type from branch name and path patterns
 * Priority: PR (from path _pr_N suffix) > issue (from branch) > branch
 */
function determineLoomType(worktree: GitWorktree): 'branch' | 'issue' | 'pr' {
  // Check for PR pattern in path: _pr_N suffix
  // This pattern is added by generateWorktreePath when isPR is true
  const prPathPattern = /_pr_\d+$/
  if (prPathPattern.test(worktree.path)) {
    return 'pr'
  }

  // Check for issue pattern in branch using existing extractIssueNumber
  const issueNumber = extractIssueNumber(worktree.branch)
  if (issueNumber !== null) {
    return 'issue'
  }

  // Default to 'branch' type
  return 'branch'
}

/**
 * Extract PR numbers from worktree path
 * Returns array of string PR numbers extracted from _pr_N suffix
 */
function extractPRNumbers(path: string): string[] {
  if (!path) {
    return []
  }

  const prPathPattern = /_pr_(\d+)$/
  const match = path.match(prPathPattern)
  if (match?.[1]) {
    return [match[1]]
  }

  return []
}

/**
 * Extract issue numbers from branch name
 * Returns array of string identifiers (may include prefixes like PROJ-)
 */
function extractIssueNumbers(branch: string): string[] {
  if (!branch) {
    return []
  }

  const issueNumber = extractIssueNumber(branch)
  if (issueNumber === null) {
    return []
  }

  // Return as array, already deduplicated by being a single extraction
  return [issueNumber]
}

/**
 * Format single worktree to JSON schema
 * - When type is 'pr': populate pr_numbers, leave issue_numbers empty
 * - When type is 'issue': populate issue_numbers, leave pr_numbers empty
 * - When type is 'branch': leave both issue_numbers and pr_numbers empty
 *
 * @param worktree - The worktree to format
 * @param mainWorktreePath - Optional path to the main worktree for isMainWorktree detection
 */
export function formatLoomForJson(worktree: GitWorktree, mainWorktreePath?: string): LoomJsonOutput {
  const loomType = determineLoomType(worktree)

  // Populate issue_numbers or pr_numbers based on type
  let issueNumbers: string[] = []
  let prNumbers: string[] = []

  if (loomType === 'pr') {
    prNumbers = extractPRNumbers(worktree.path)
  } else if (loomType === 'issue') {
    issueNumbers = extractIssueNumbers(worktree.branch)
  }
  // For 'branch' type, both remain empty

  // Determine if this is the main worktree by comparing paths
  const isMainWorktree = mainWorktreePath ? worktree.path === mainWorktreePath : false

  return {
    name: worktree.branch || worktree.path,
    worktreePath: worktree.bare ? null : worktree.path,
    branch: worktree.branch || null,
    type: loomType,
    issue_numbers: issueNumbers,
    pr_numbers: prNumbers,
    isMainWorktree,
  }
}

/**
 * Format array of worktrees to JSON schema
 *
 * @param worktrees - Array of worktrees to format
 * @param mainWorktreePath - Optional path to the main worktree for isMainWorktree detection
 */
export function formatLoomsForJson(worktrees: GitWorktree[], mainWorktreePath?: string): LoomJsonOutput[] {
  return worktrees.map(wt => formatLoomForJson(wt, mainWorktreePath))
}
