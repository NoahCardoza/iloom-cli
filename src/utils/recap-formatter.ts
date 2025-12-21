/**
 * Composable markdown formatting functions for recap output
 *
 * Enables generating recap markdown programmatically without running the CLI.
 */
import type { RecapOutput, RecapComplexity, RecapEntry, RecapArtifact } from '../mcp/recap-types.js'

/**
 * Format header section with title and file path
 */
export function formatHeaderSection(filePath: string): string {
	return `# Loom Recap\n\n**File:** \`${filePath}\``
}

/**
 * Format goal section
 */
export function formatGoalSection(goal: string | null): string {
	return `## Goal\n${goal ?? '(not set)'}`
}

/**
 * Format complexity section
 */
export function formatComplexitySection(complexity: RecapComplexity | null): string {
	if (!complexity) {
		return '## Complexity\n(not set)'
	}
	const formattedLevel = `**${complexity.level}**`
	const reasonSuffix = complexity.reason ? ` - ${complexity.reason}` : ''
	return `## Complexity\n${formattedLevel}${reasonSuffix}`
}

/**
 * Format entries section with count and list
 */
export function formatEntriesSection(entries: RecapEntry[]): string {
	const header = `## Entries (${entries.length})`
	if (entries.length === 0) {
		return header
	}
	const items = entries.map((entry) => `- **[${entry.type}]** ${entry.content}`)
	return `${header}\n${items.join('\n')}`
}

/**
 * Format artifacts section with count and list
 */
export function formatArtifactsSection(artifacts: RecapArtifact[]): string {
	const header = `## Artifacts (${artifacts.length})`
	if (artifacts.length === 0) {
		return header
	}
	const items = artifacts.map((artifact) => `- **[${artifact.type}](${artifact.primaryUrl})** ${artifact.description}`)
	return `${header}\n${items.join('\n')}`
}

/**
 * Main function: compose all sections into full markdown string
 */
export function formatRecapMarkdown(recap: RecapOutput): string {
	const sections = [
		formatHeaderSection(recap.filePath),
		formatGoalSection(recap.goal),
		formatComplexitySection(recap.complexity),
		formatEntriesSection(recap.entries),
		formatArtifactsSection(recap.artifacts),
	]
	return sections.join('\n\n')
}
