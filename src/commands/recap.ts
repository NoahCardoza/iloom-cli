/**
 * RecapCommand - Fast read-only command for VS Code extension
 *
 * Reads ~/.config/iloom-ai/recaps/{current-loom}.json and outputs it.
 * Skips config validation for fast startup.
 * Includes filePath in output so extension can set up file watcher.
 */
import path from 'path'
import os from 'os'
import fs from 'fs-extra'
import type { RecapFile, RecapOutput } from '../mcp/recap-types.js'

const RECAPS_DIR = path.join(os.homedir(), '.config', 'iloom-ai', 'recaps')

/**
 * Reuse MetadataManager.slugifyPath() algorithm
 *
 * Algorithm:
 * 1. Trim trailing slashes
 * 2. Replace all path separators (/ or \) with ___ (triple underscore)
 * 3. Replace any other non-alphanumeric characters (except _ and -) with -
 * 4. Append .json
 */
function slugifyPath(loomPath: string): string {
	let slug = loomPath.replace(/[/\\]+$/, '')
	slug = slug.replace(/[/\\]/g, '___')
	slug = slug.replace(/[^a-zA-Z0-9_-]/g, '-')
	return `${slug}.json`
}

export interface RecapCommandInput {
	json?: boolean
}

export class RecapCommand {
	/**
	 * Execute the recap command
	 * Returns RecapOutput in JSON mode, void otherwise
	 */
	async execute(input: RecapCommandInput): Promise<RecapOutput | void> {
		// Derive recap file path from current working directory
		const loomPath = process.cwd()
		const filePath = path.join(RECAPS_DIR, slugifyPath(loomPath))

		// Read recap file (return empty object if not found)
		let recap: RecapFile = {}
		try {
			if (await fs.pathExists(filePath)) {
				const content = await fs.readFile(filePath, 'utf8')
				recap = JSON.parse(content) as RecapFile
			}
		} catch {
			// Graceful degradation - return empty recap on read error
			// This is intentional for fast startup
		}

		// Build output with filePath for file watching (provide defaults for optional fields)
		const goal = recap.goal ?? null
		const entries = recap.entries ?? []
		const result: RecapOutput = { filePath, goal, entries }

		if (input.json) {
			return result
		}

		// Non-JSON mode: print human-readable format (intentionally using console.log for piping/redirection)
		// eslint-disable-next-line no-console
		console.log(`Recap file: ${filePath}`)
		// eslint-disable-next-line no-console
		console.log(`Goal: ${goal ?? '(not set)'}`)
		// eslint-disable-next-line no-console
		console.log(`Entries: ${entries.length}`)
		for (const entry of entries) {
			// eslint-disable-next-line no-console
			console.log(`  [${entry.type}] ${entry.content}`)
		}
	}
}
