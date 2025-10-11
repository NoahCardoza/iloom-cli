import { execa } from 'execa'
import type { Platform } from '../types/index.js'

export interface TerminalWindowOptions {
	workspacePath?: string
	command?: string
	backgroundColor?: { r: number; g: number; b: number }
	port?: number
	includeEnvSetup?: boolean // source .env
	includePortExport?: boolean // export PORT=<port>
}

/**
 * Detect current platform
 */
export function detectPlatform(): Platform {
	const platform = process.platform
	if (platform === 'darwin') return 'darwin'
	if (platform === 'linux') return 'linux'
	if (platform === 'win32') return 'win32'
	return 'unsupported'
}

/**
 * Open new terminal window with specified options
 * Currently supports macOS only
 */
export async function openTerminalWindow(
	options: TerminalWindowOptions
): Promise<void> {
	const platform = detectPlatform()

	if (platform !== 'darwin') {
		throw new Error(
			`Terminal window launching not yet supported on ${platform}. ` +
				`Currently only macOS is supported.`
		)
	}

	// macOS implementation using AppleScript
	const applescript = buildAppleScript(options)

	try {
		await execa('osascript', ['-e', applescript])

		// Activate Terminal.app to bring windows to front
		await execa('osascript', ['-e', 'tell application "Terminal" to activate'])
	} catch (error) {
		throw new Error(
			`Failed to open terminal window: ${error instanceof Error ? error.message : 'Unknown error'}`
		)
	}
}

/**
 * Build AppleScript for macOS Terminal.app
 */
function buildAppleScript(options: TerminalWindowOptions): string {
	const {
		workspacePath,
		command,
		backgroundColor,
		port,
		includeEnvSetup,
		includePortExport,
	} = options

	// Build command sequence
	const commands: string[] = []

	// Navigate to workspace
	if (workspacePath) {
		commands.push(`cd '${escapePathForAppleScript(workspacePath)}'`)
	}

	// Source .env file
	if (includeEnvSetup) {
		commands.push('source .env')
	}

	// Export PORT variable
	if (includePortExport && port !== undefined) {
		commands.push(`export PORT=${port}`)
	}

	// Add custom command
	if (command) {
		commands.push(command)
	}

	// Join with &&
	const fullCommand = commands.join(' && ')

	// Prefix with space to prevent shell history pollution
	// Most shells (bash/zsh) ignore commands starting with space when HISTCONTROL=ignorespace
	const historyFreeCommand = ` ${fullCommand}`

	// Build AppleScript
	let script = `tell application "Terminal"\n`
	script += `  set newTab to do script "${escapeForAppleScript(historyFreeCommand)}"\n`

	// Apply background color if provided
	if (backgroundColor) {
		const { r, g, b } = backgroundColor
		script += `  set background color of newTab to {${Math.round(r * 256)}, ${Math.round(g * 256)}, ${Math.round(b * 256)}}\n`
	}

	script += `end tell`

	return script
}

/**
 * Escape path for AppleScript string
 * Single quotes in path need special escaping
 */
function escapePathForAppleScript(path: string): string {
	// Replace single quote with '\''
	return path.replace(/'/g, "'\\''")
}

/**
 * Escape command for AppleScript do script
 * Must handle double quotes and backslashes
 */
function escapeForAppleScript(command: string): string {
	return (
		command
			.replace(/\\/g, '\\\\') // Escape backslashes
			.replace(/"/g, '\\"') // Escape double quotes
	)
}
