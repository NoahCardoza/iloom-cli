/**
 * Claude Transcript Utilities
 *
 * Provides functions to read and parse Claude Code session transcript files
 * stored in ~/.claude/projects/. These transcripts contain the full conversation
 * history including compact summaries from when conversations were compacted.
 */

import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { logger } from './logger.js'

/**
 * Entry in a Claude Code JSONL transcript file
 */
export interface TranscriptEntry {
	type: 'user' | 'assistant' | 'system' | 'file-history-snapshot' | 'queue-operation'
	sessionId?: string
	message?: { role: string; content: string | Array<{ type: string; text?: string }> }
	isCompactSummary?: boolean
	isVisibleInTranscriptOnly?: boolean
	subtype?: string // 'compact_boundary' for compaction markers
	content?: string
	timestamp?: string
	uuid?: string
	parentUuid?: string
}

/**
 * Get the Claude projects directory path encoding for a worktree path
 * Encoding: /Users/adam/Projects/foo_bar -> -Users-adam-Projects-foo-bar
 *
 * Claude Code encodes paths by replacing both '/' and '_' with '-'
 *
 * @param worktreePath - Absolute path to the worktree
 * @returns Encoded directory name for Claude projects
 */
export function getClaudeProjectPath(worktreePath: string): string {
	// Replace all '/' and '_' with '-' (matching Claude Code's encoding)
	return worktreePath.replace(/[/_]/g, '-')
}

/**
 * Get the full path to the Claude projects directory
 * @returns Path to ~/.claude/projects/
 */
export function getClaudeProjectsDir(): string {
	return join(homedir(), '.claude', 'projects')
}

/**
 * Find the session transcript file for a given worktree and session ID
 *
 * @param worktreePath - Absolute path to the worktree
 * @param sessionId - Session ID to find transcript for
 * @returns Full path to the transcript file, or null if not found
 */
export function findSessionTranscript(worktreePath: string, sessionId: string): string | null {
	const projectsDir = getClaudeProjectsDir()
	const projectDirName = getClaudeProjectPath(worktreePath)
	const transcriptPath = join(projectsDir, projectDirName, `${sessionId}.jsonl`)
	return transcriptPath
}

/**
 * Extract the content from a compact summary message
 * Handles both string content and array content formats
 */
function extractMessageContent(message: TranscriptEntry['message']): string | null {
	if (!message) return null

	if (typeof message.content === 'string') {
		return message.content
	}

	if (Array.isArray(message.content)) {
		// Concatenate all text elements
		return message.content
			.filter((item) => item.type === 'text' && item.text)
			.map((item) => item.text)
			.join('\n')
	}

	return null
}

/**
 * Extract compact summaries from a session transcript file
 *
 * Returns empty array if file doesn't exist or no summaries found.
 * Each compact summary contains structured history of pre-compaction conversation.
 *
 * @param transcriptPath - Full path to the transcript JSONL file
 * @param maxSummaries - Maximum number of summaries to return (default 3)
 * @returns Array of compact summary content strings, newest first
 */
export async function extractCompactSummaries(
	transcriptPath: string,
	maxSummaries = 3
): Promise<string[]> {
	try {
		const content = await readFile(transcriptPath, 'utf-8')
		const lines = content.split('\n').filter((line) => line.trim())

		const summaries: string[] = []

		for (const line of lines) {
			try {
				const entry = JSON.parse(line) as TranscriptEntry

				// Look for compact summary entries
				if (entry.isCompactSummary === true && entry.message) {
					const summaryContent = extractMessageContent(entry.message)
					if (summaryContent) {
						summaries.push(summaryContent)
					}
				}
			} catch {
				// Skip malformed JSON lines
				logger.debug('Skipping malformed JSONL line in transcript')
			}
		}

		// Return most recent summaries (they appear in order in the file)
		// Limit to maxSummaries
		return summaries.slice(-maxSummaries)
	} catch (error) {
		// File not found or permission error - return empty array (graceful degradation)
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
			logger.debug('Transcript file not found:', transcriptPath)
		} else {
			logger.debug('Error reading transcript file:', error)
		}
		return []
	}
}

/**
 * Read session transcript and extract compact summaries for summary generation
 *
 * This is the main entry point for SessionSummaryService to get pre-compaction
 * conversation context. It gracefully handles all error cases.
 *
 * @param worktreePath - Absolute path to the worktree
 * @param sessionId - Session ID to find transcript for
 * @param maxSummaries - Maximum number of summaries to return (default 3)
 * @returns Formatted string of compact summaries, or null if none found
 */
export async function readSessionContext(
	worktreePath: string,
	sessionId: string,
	maxSummaries = 3
): Promise<string | null> {
	const transcriptPath = findSessionTranscript(worktreePath, sessionId)
	if (!transcriptPath) {
		return null
	}

	logger.debug(`Checking transcript at: ${transcriptPath}`)

	const summaries = await extractCompactSummaries(transcriptPath, maxSummaries)

	if (summaries.length === 0) {
		return null
	}

	// Format summaries with separators
	// Newest summaries are at the end, so we reverse to show newest first
	const formattedSummaries = summaries
		.reverse()
		.map((summary, index) => {
			const header =
				summaries.length > 1
					? `### Compact Summary ${index + 1} of ${summaries.length}\n\n`
					: ''
			return `${header}${summary}`
		})
		.join('\n\n---\n\n')

	return formattedSummaries
}
