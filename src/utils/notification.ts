import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'

// Debug logging - Set ILOOM_NOTIF_DEBUG=1 to enable
const DEBUG = process.env.ILOOM_NOTIF_DEBUG === '1'
const LOG_FILE = '/tmp/iloom-notif.log'

function debug(message: string, data: Record<string, unknown> = {}): void {
	if (!DEBUG) return

	const timestamp = new Date().toISOString()
	const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : ''
	const logLine = `[${timestamp}] ${message}${dataStr}\n`

	try {
		fs.appendFileSync(LOG_FILE, logLine)
	} catch {
		// Ignore logging errors
	}
}

/**
 * Slugify a worktree path to create a metadata filename.
 * Must match MetadataManager.slugifyPath() algorithm.
 *
 * @param worktreePath - Absolute path to worktree
 * @returns Slugified filename with .json extension
 */
function slugifyPath(worktreePath: string): string {
	// 1. Trim trailing slashes
	let slug = worktreePath.replace(/[/\\]+$/, '')
	// 2. Replace path separators with triple underscores
	slug = slug.replace(/[/\\]/g, '___')
	// 3. Replace non-alphanumeric chars (except _ and -) with hyphens
	slug = slug.replace(/[^a-zA-Z0-9_-]/g, '-')
	// 4. Append .json
	return `${slug}.json`
}

/**
 * Get the full path to the metadata file for a worktree.
 *
 * @param cwd - Working directory (worktree path)
 * @returns Full path to metadata JSON file
 */
function getMetadataFilePath(cwd: string): string {
	const loomsDir = path.join(os.homedir(), '.config', 'iloom-ai', 'looms')
	return path.join(loomsDir, slugifyPath(cwd))
}

/**
 * Read session ID from the metadata file for a worktree.
 * Returns null if the file doesn't exist or can't be read.
 *
 * @param cwd - Working directory (worktree path)
 * @returns Session ID or null
 */
function readSessionId(cwd: string): string | null {
	try {
		const filePath = getMetadataFilePath(cwd)
		debug('Reading metadata file', { cwd, filePath })

		if (!fs.existsSync(filePath)) {
			debug('Metadata file not found', { filePath })
			return null
		}

		const content = fs.readFileSync(filePath, 'utf8')
		const metadata = JSON.parse(content) as { sessionId?: string }
		debug('Read session ID from metadata', { sessionId: metadata.sessionId })
		return metadata.sessionId ?? null
	} catch (error) {
		debug('Failed to read session ID', { cwd, error: String(error) })
		return null
	}
}

/**
 * Find all iloom named pipes on Windows.
 * Named pipes are listed under \\.\pipe\ and we look for iloom-* pattern.
 *
 * @returns Array of named pipe paths
 */
function findWindowsNamedPipes(): string[] {
	try {
		// Use PowerShell to list named pipes matching our pattern
		// Get-ChildItem \\.\pipe\ lists all named pipes
		const output = execSync(
			'powershell -Command "Get-ChildItem \\\\.\\pipe\\ | Where-Object { $_.Name -like \'iloom-*\' } | Select-Object -ExpandProperty FullName"',
			{ encoding: 'utf-8', timeout: 5000 }
		)

		return output
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0)
	} catch {
		return []
	}
}

/**
 * Find all iloom sockets/pipes in the system.
 * Mirrors findAllIloomSockets() from iloom-hook.js.
 *
 * On Windows, looks for named pipes matching \\.\pipe\iloom-* pattern.
 * On Unix, looks for Unix sockets matching iloom-*.sock in temp directory.
 *
 * @returns Array of socket/pipe paths
 */
export function findAllIloomSockets(): string[] {
	// On Windows, use named pipes instead of Unix sockets
	if (process.platform === 'win32') {
		return findWindowsNamedPipes()
	}

	try {
		// Use /tmp explicitly, NOT tmpdir() which returns /var/folders/... on macOS
		// The VS Code extension creates sockets in /tmp, matching iloom-hook.js behavior
		const tempDir = '/tmp'
		const files = fs.readdirSync(tempDir)
		const sockets = files
			.filter((file) => file.startsWith('iloom-') && file.endsWith('.sock'))
			.map((file) => path.join(tempDir, file))
			.filter((socketPath) => {
				// Verify it's actually a socket
				try {
					const stat = fs.statSync(socketPath)
					return stat.isSocket()
				} catch {
					return false
				}
			})

		return sockets
	} catch {
		return []
	}
}

/**
 * Send status to a single socket (fire and forget).
 * Mirrors sendStatus() from iloom-hook.js.
 *
 * @param socketPath Path to Unix socket or Windows named pipe
 * @param status Session status
 * @param cwd Current working directory
 * @param hookEventName Synthetic hook event name for the VS Code extension
 * @param sessionId Session ID from metadata (required by VS Code extension)
 */
async function sendStatus(
	socketPath: string,
	status: string,
	cwd: string,
	hookEventName: string,
	sessionId: string | null,
	toolName: string
): Promise<void> {
	return new Promise((resolve) => {
		const client = net.createConnection(socketPath, () => {
			// Match the message format from iloom-hook.js so VS Code extension handles it correctly
			const message = JSON.stringify({
				type: 'session_status',
				status,
				session_id: sessionId,
				hook_event_name: hookEventName,
				tool_name: toolName,
				cwd,
				timestamp: new Date().toISOString(),
			})

			debug('Sending status to socket', { socketPath, status, sessionId, hookEventName, cwd })

			client.write(message + '\n')
			// Fire and forget - close connection immediately after sending
			client.end()
			resolve()
		})

		// Handle connection errors silently
		client.on('error', (err) => {
			debug('Socket connection error', { socketPath, error: String(err) })
			resolve()
		})
	})
}

/**
 * Broadcast status to all iloom sockets.
 *
 * @param status Session status to broadcast
 * @param cwd Current working directory
 * @param hookEventName Synthetic hook event name for the VS Code extension
 */
async function broadcastStatus(
	status: string,
	cwd: string,
	hookEventName: string,
	toolName: string
): Promise<void> {
	debug('broadcastStatus called', { status, cwd, hookEventName, toolName })

	const sockets = findAllIloomSockets()
	debug('Found sockets', { count: sockets.length, sockets })

	if (sockets.length === 0) {
		debug('No sockets found, skipping broadcast')
		return
	}

	// Read session ID from metadata file
	const sessionId = readSessionId(cwd)
	debug('Session ID for broadcast', { sessionId })

	const promises = sockets.map((socketPath) =>
		sendStatus(socketPath, status, cwd, hookEventName, sessionId, toolName).catch(() => {
			// Silent failure - don't interrupt the CLI
		})
	)

	await Promise.allSettled(promises)
	debug('Broadcast completed')
}

/**
 * Broadcast approval notification (waiting_for_approval status).
 * Call this when the CLI is waiting for user input.
 * Uses 'CommitApproval' as the synthetic hook event name.
 * Uses 'commit' as the tool_name to distinguish from Claude's PermissionRequest.
 *
 * @param cwd Current working directory
 */
export async function broadcastApprovalNotification(cwd: string): Promise<void> {
	// Use 'CommitApproval' hook event and 'iloom_commit' tool_name to distinguish from Claude's hooks
	// This allows the VS Code extension to prevent PostToolUse from clearing commit approvals
	await broadcastStatus('waiting_for_approval', cwd, 'CommitApproval', 'iloom_commit')
}

/**
 * Clear approval notification (working status).
 * Call this when the user has made their selection.
 *
 * @param cwd Current working directory
 */
export async function clearApprovalNotification(cwd: string): Promise<void> {
	// Use 'CommitApprovalResponse' to indicate user responded to commit prompt
	await broadcastStatus('working', cwd, 'CommitApprovalResponse', 'iloom_commit')
}
