/**
 * Shared label utilities for issue tracker integrations.
 *
 * Used by GitHub and Jira issue management providers to merge configured
 * default labels with agent-supplied labels before forwarding them to the
 * underlying tracker API. Keeping the merge semantics in one helper ensures
 * both providers behave consistently (configured-first, case-sensitive,
 * deduped via Set).
 */
import { logger } from './logger.js'

/**
 * Merge configured default labels with agent-supplied labels.
 *
 * Behavior:
 * - Configured labels come first, preserving their declared order.
 * - Agent-supplied labels follow, preserving their order.
 * - The result is deduped (case-sensitive) using Set semantics so the first
 *   occurrence wins.
 * - Empty/missing inputs are treated as `[]`.
 *
 * Note: labels are compared case-sensitively on purpose. GitHub treats labels
 * case-insensitively on lookup but stores them with the casing they were
 * created with, and Jira treats labels case-sensitively. Preserving the
 * original casing avoids surprising the user when the rendered label differs
 * from what they configured.
 */
export function mergeLabels(
	configured: string[] = [],
	supplied: string[] = [],
): string[] {
	const seen = new Set<string>()
	const result: string[] = []

	for (const label of configured) {
		if (!seen.has(label)) {
			seen.add(label)
			result.push(label)
		}
	}

	for (const label of supplied) {
		if (!seen.has(label)) {
			seen.add(label)
			result.push(label)
		}
	}

	return result
}

/**
 * Parse a JSON-encoded label array from an environment variable.
 * Returns an empty array for any malformed input so env-var consumers
 * degrade gracefully instead of crashing.
 */
export function parseLabelsFromEnv(envValue: string | undefined, envVarName: string): string[] {
	if (!envValue) return []
	try {
		const parsed = JSON.parse(envValue)
		if (!Array.isArray(parsed)) {
			logger.warn(`${envVarName} must be a JSON array of strings, got type "${typeof parsed}". Ignoring.`)
			return []
		}
		const result: string[] = []
		for (const item of parsed) {
			if (typeof item !== 'string' || item.length === 0) {
				logger.warn(`${envVarName} contains a non-string or empty entry. Ignoring entire value.`)
				return []
			}
			result.push(item)
		}
		return result
	} catch (error) {
		logger.warn(`Invalid JSON in ${envVarName}. Ignoring.`, {
			error: error instanceof Error ? error.message : 'unknown error',
		})
		return []
	}
}
