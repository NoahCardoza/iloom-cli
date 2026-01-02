import { createHash } from 'crypto'

/**
 * Wrap a raw port that exceeds 65535 into the valid port range.
 * Uses modulo arithmetic to wrap back into [basePort+1, 65535].
 *
 * @param rawPort - The calculated port (basePort + issueNumber)
 * @param basePort - The base port (default: 3000)
 * @returns Port in valid range [basePort+1, 65535]
 */
export function wrapPort(rawPort: number, basePort: number): number {
	if (rawPort <= 65535) return rawPort
	const range = 65535 - basePort
	return ((rawPort - basePort - 1) % range) + basePort + 1
}

/**
 * Extract numeric suffix from alphanumeric issue ID (e.g., MARK-324 -> 324)
 * @returns The numeric part or null if no trailing number found
 */
export function extractNumericSuffix(issueId: string): number | null {
	// Match trailing digits after optional separator (-, _)
	const match = issueId.match(/[-_]?(\d+)$/)
	const digits = match?.[1]
	if (digits === undefined) return null
	return parseInt(digits, 10)
}

/**
 * Generate deterministic port offset from branch name using SHA256 hash
 * Range: 1-999 (matches existing random range for branches)
 *
 * @param branchName - Branch name to generate port offset from
 * @returns Port offset in range [1, 999]
 * @throws Error if branchName is empty
 */
export function generatePortOffsetFromBranchName(branchName: string): number {
	// Validate input
	if (!branchName || branchName.trim().length === 0) {
		throw new Error('Branch name cannot be empty')
	}

	// Generate SHA256 hash of branch name (same pattern as color.ts)
	const hash = createHash('sha256').update(branchName).digest('hex')

	// Take first 8 hex characters and convert to port offset (1-999)
	const hashPrefix = hash.slice(0, 8)
	const hashAsInt = parseInt(hashPrefix, 16)
	const portOffset = (hashAsInt % 999) + 1 // +1 ensures range is 1-999, not 0-998

	return portOffset
}

/**
 * Calculate deterministic port for branch-based workspace
 *
 * @param branchName - Branch name
 * @param basePort - Base port (default: 3000)
 * @returns Port number
 * @throws Error if branchName is empty
 */
export function calculatePortForBranch(branchName: string, basePort: number = 3000): number {
	const offset = generatePortOffsetFromBranchName(branchName)
	const port = basePort + offset

	// Use wrap-around for port overflow
	return wrapPort(port, basePort)
}
