/**
 * Loom Recap MCP Server
 *
 * Captures session context (goal, decisions, insights, risks, assumptions)
 * for the VS Code Loom Context Panel.
 *
 * Environment variables:
 * - RECAP_FILE_PATH: Complete path to the recap.json file (read/write)
 * - LOOM_METADATA_JSON: Stringified JSON of the loom metadata (parsed using LoomMetadata type)
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import path from 'path'
import fs from 'fs-extra'
import { randomUUID } from 'crypto'
import type { RecapFile, RecapEntry, RecapOutput } from './recap-types.js'
import type { LoomMetadata } from '../lib/MetadataManager.js'

interface EnvConfig {
	recapFilePath: string
	loomMetadata: LoomMetadata
}

// Store validated config for use in tool handlers
let validatedRecapFilePath: string | null = null
let validatedLoomMetadata: LoomMetadata | null = null

/**
 * Validate required environment variables
 * Exits with error if missing (matches issue-management-server.ts pattern)
 */
function validateEnvironment(): EnvConfig {
	const recapFilePath = process.env.RECAP_FILE_PATH
	const loomMetadataJson = process.env.LOOM_METADATA_JSON

	if (!recapFilePath) {
		console.error('Missing required environment variable: RECAP_FILE_PATH')
		process.exit(1)
	}
	if (!loomMetadataJson) {
		console.error('Missing required environment variable: LOOM_METADATA_JSON')
		process.exit(1)
	}

	let loomMetadata: LoomMetadata
	try {
		loomMetadata = JSON.parse(loomMetadataJson) as LoomMetadata
	} catch (error) {
		console.error('Failed to parse LOOM_METADATA_JSON:', error)
		process.exit(1)
	}

	// Store for tool handlers
	validatedRecapFilePath = recapFilePath
	validatedLoomMetadata = loomMetadata

	return { recapFilePath, loomMetadata }
}

/**
 * Get the validated recap file path
 * Throws if called before validateEnvironment()
 */
function getRecapFilePath(): string {
	if (!validatedRecapFilePath) {
		throw new Error('RECAP_FILE_PATH not validated - validateEnvironment() must be called first')
	}
	return validatedRecapFilePath
}

/**
 * Get the validated loom metadata
 * Throws if called before validateEnvironment()
 */
export function getLoomMetadata(): LoomMetadata {
	if (!validatedLoomMetadata) {
		throw new Error('LOOM_METADATA_JSON not validated - validateEnvironment() must be called first')
	}
	return validatedLoomMetadata
}

/**
 * Read recap file (returns empty object if not found or invalid)
 */
async function readRecapFile(filePath: string): Promise<RecapFile> {
	try {
		if (await fs.pathExists(filePath)) {
			const content = await fs.readFile(filePath, 'utf8')
			return JSON.parse(content) as RecapFile
		}
	} catch (error) {
		console.error(`Warning: Could not read recap file: ${error}`)
	}
	return {}
}

/**
 * Write recap file (ensures parent directory exists)
 */
async function writeRecapFile(filePath: string, recap: RecapFile): Promise<void> {
	await fs.ensureDir(path.dirname(filePath), { mode: 0o755 })
	await fs.writeFile(filePath, JSON.stringify(recap, null, 2), { mode: 0o644 })
}

// Initialize MCP server
const server = new McpServer({
	name: 'loom-recap',
	version: '0.1.0',
})

// Register set_goal tool
server.registerTool(
	'set_goal',
	{
		title: 'Set Goal',
		description: 'Set the initial goal (called once at session start)',
		inputSchema: {
			goal: z.string().describe('The original problem statement'),
		},
		outputSchema: {
			success: z.literal(true),
		},
	},
	async ({ goal }) => {
		const filePath = getRecapFilePath()
		const recap = await readRecapFile(filePath)
		recap.goal = goal
		await writeRecapFile(filePath, recap)
		return {
			content: [{ type: 'text' as const, text: JSON.stringify({ success: true }) }],
			structuredContent: { success: true },
		}
	}
)

// Register add_entry tool
server.registerTool(
	'add_entry',
	{
		title: 'Add Entry',
		description: 'Append an entry to the recap',
		inputSchema: {
			type: z
				.enum(['decision', 'insight', 'risk', 'assumption', 'other'])
				.describe('Entry type'),
			content: z.string().describe('Entry content'),
		},
		outputSchema: {
			id: z.string(),
			timestamp: z.string(),
		},
	},
	async ({ type, content }) => {
		const filePath = getRecapFilePath()
		const recap = await readRecapFile(filePath)
		const entry: RecapEntry = {
			id: randomUUID(),
			timestamp: new Date().toISOString(),
			type,
			content,
		}
		recap.entries ??= []
		recap.entries.push(entry)
		await writeRecapFile(filePath, recap)
		const result = { id: entry.id, timestamp: entry.timestamp }
		return {
			content: [{ type: 'text' as const, text: JSON.stringify(result) }],
			structuredContent: result,
		}
	}
)

// Register get_recap tool
server.registerTool(
	'get_recap',
	{
		title: 'Get Recap',
		description: 'Read current recap (for catching up or review)',
		inputSchema: {},
		outputSchema: {
			filePath: z.string(),
			goal: z.string().nullable(),
			entries: z.array(
				z.object({
					id: z.string(),
					timestamp: z.string(),
					type: z.enum(['decision', 'insight', 'risk', 'assumption', 'other']),
					content: z.string(),
				})
			),
		},
	},
	async () => {
		const filePath = getRecapFilePath()
		const recap = await readRecapFile(filePath)
		// Use loom description as default goal for new/missing recap files
		const defaultGoal = getLoomMetadata().description || null
		const result: RecapOutput = {
			filePath,
			goal: recap.goal ?? defaultGoal,
			entries: recap.entries ?? [],
		}
		return {
			content: [{ type: 'text' as const, text: JSON.stringify(result) }],
			structuredContent: result as unknown as Record<string, unknown>,
		}
	}
)

// Main server startup
async function main(): Promise<void> {
	console.error('Starting Loom Recap MCP Server...')
	const { recapFilePath, loomMetadata } = validateEnvironment()
	console.error(`Recap file path: ${recapFilePath}`)
	console.error(`Loom: ${loomMetadata.description} (branch: ${loomMetadata.branchName})`)
	const transport = new StdioServerTransport()
	await server.connect(transport)
	console.error('Loom Recap MCP Server running on stdio transport')
}

main().catch((error) => {
	console.error('Fatal error starting MCP server:', error)
	process.exit(1)
})
