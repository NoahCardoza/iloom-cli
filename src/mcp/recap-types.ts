/**
 * Type definitions for Loom Recap MCP Server
 *
 * The Recap MCP captures session context that scrolls away during Claude sessions:
 * - Goal: The original problem statement
 * - Entries: Decisions, insights, risks, assumptions discovered during the session
 */

/** Entry types for recap entries */
export type RecapEntryType = 'decision' | 'insight' | 'risk' | 'assumption' | 'other'

/** Single recap entry */
export interface RecapEntry {
	id: string
	timestamp: string
	type: RecapEntryType
	content: string
}

/** Recap file schema stored in ~/.config/iloom-ai/recaps/ */
export interface RecapFile {
	goal?: string | null
	entries?: RecapEntry[]
}

/** Output for get_recap tool and CLI --json (includes filePath for file watching) */
export interface RecapOutput {
	filePath: string
	goal: string | null
	entries: RecapEntry[]
}

/** Input for set_goal tool */
export interface SetGoalInput {
	goal: string
}

/** Input for add_entry tool */
export interface AddEntryInput {
	type: RecapEntryType
	content: string
}

/** Output for add_entry tool */
export interface AddEntryOutput {
	id: string
	timestamp: string
}

/** Output for set_goal tool */
export interface SetGoalOutput {
	success: true
}
