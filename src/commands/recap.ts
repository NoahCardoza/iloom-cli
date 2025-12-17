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
import { GitWorktreeManager } from '../lib/GitWorktreeManager.js'
import { IdentifierParser } from '../utils/IdentifierParser.js'

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
	identifier?: string | undefined // Optional identifier (issue number, PR number, branch name)
	json?: boolean | undefined
}

export class RecapCommand {
	/**
	 * Execute the recap command
	 * Returns RecapOutput in JSON mode, void otherwise
	 */
	async execute(input: RecapCommandInput): Promise<RecapOutput | void> {
		// Resolve loom path from identifier or fall back to cwd
		const loomPath = await this.resolveLoomPath(input.identifier)
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
		const artifacts = recap.artifacts ?? []
		const result: RecapOutput = { filePath, goal, entries, artifacts }

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
		// eslint-disable-next-line no-console
		console.log(`Artifacts: ${artifacts.length}`)
		for (const artifact of artifacts) {
			// eslint-disable-next-line no-console
			console.log(`  [${artifact.type}] ${artifact.description} - ${artifact.primaryUrl}`)
		}
	}

	/**
	 * Resolve identifier to loom path
	 * Falls back to cwd when no identifier is provided (backward compatible)
	 */
	private async resolveLoomPath(identifier: string | undefined): Promise<string> {
		// Default: use current working directory
		if (!identifier?.trim()) {
			return process.cwd()
		}

		const trimmedId = identifier.trim()
		const gitWorktreeManager = new GitWorktreeManager()
		const identifierParser = new IdentifierParser(gitWorktreeManager)

		// Check for PR-specific formats: pr/123, PR-123, PR/123
		const prPattern = /^(?:pr|PR)[/-](\d+)$/
		const prMatch = trimmedId.match(prPattern)
		if (prMatch?.[1]) {
			const prNumber = parseInt(prMatch[1], 10)
			const worktree = await gitWorktreeManager.findWorktreeForPR(prNumber, '')
			if (worktree) {
				return worktree.path
			}
			throw new Error(`No worktree found for PR #${prNumber}`)
		}

		// Use IdentifierParser for pattern-based detection
		try {
			const parsed = await identifierParser.parseForPatternDetection(trimmedId)

			// Find worktree based on parsed type
			if (parsed.type === 'pr' && typeof parsed.number === 'number') {
				const worktree = await gitWorktreeManager.findWorktreeForPR(parsed.number, '')
				if (worktree) {
					return worktree.path
				}
				throw new Error(`No worktree found for PR #${parsed.number}`)
			}

			if (parsed.type === 'issue' && parsed.number !== undefined) {
				const worktree = await gitWorktreeManager.findWorktreeForIssue(parsed.number)
				if (worktree) {
					return worktree.path
				}
				throw new Error(`No worktree found for issue #${parsed.number}`)
			}

			if (parsed.type === 'branch' && parsed.branchName) {
				const worktree = await gitWorktreeManager.findWorktreeForBranch(parsed.branchName)
				if (worktree) {
					return worktree.path
				}
				throw new Error(`No worktree found for branch: ${parsed.branchName}`)
			}
		} catch (error) {
			// Re-throw IdentifierParser errors with context
			if (error instanceof Error) {
				throw new Error(`Could not resolve identifier '${identifier}': ${error.message}`)
			}
			throw error
		}

		// Should not reach here, but provide a fallback error
		throw new Error(`Could not resolve identifier: ${identifier}`)
	}
}
