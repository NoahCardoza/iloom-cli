import path from 'path'

/**
 * Normalize a path for cross-platform comparison.
 *
 * On Windows:
 * - Converts backslashes to forward slashes
 * - Lowercases the path (Windows paths are case-insensitive)
 *
 * On Unix:
 * - Normalizes path separators via path.normalize()
 *
 * Use this when comparing paths that may come from different sources
 * (e.g., metadata files, filesystem, user input).
 */
export function normalizePath(inputPath: string): string {
  // First normalize using Node's path module (handles . and .. and duplicate separators)
  const normalized = path.normalize(inputPath)

  if (process.platform === 'win32') {
    // Windows: convert backslashes to forward slashes and lowercase
    return normalized.replace(/\\/g, '/').toLowerCase()
  }

  return normalized
}

/**
 * Compare two paths for equality, handling cross-platform differences.
 */
export function pathsEqual(path1: string | null | undefined, path2: string | null | undefined): boolean {
  if (path1 == null || path2 == null) {
    return path1 === path2
  }
  return normalizePath(path1) === normalizePath(path2)
}
