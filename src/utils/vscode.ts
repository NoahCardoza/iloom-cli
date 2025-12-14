import { execa } from 'execa'
import { logger } from './logger.js'

/**
 * Check if running inside VSCode's integrated terminal
 * VSCode sets TERM_PROGRAM=vscode in its integrated terminal
 */
export function isRunningInVSCode(): boolean {
	return process.env.TERM_PROGRAM === 'vscode'
}

/**
 * Check if running inside Cursor's integrated terminal
 * Cursor sets CURSOR_TRACE_ID environment variable in its terminal
 * Note: Cursor may also set TERM_PROGRAM=vscode, so this check should be done first
 */
export function isRunningInCursor(): boolean {
	return !!process.env.CURSOR_TRACE_ID
}

/**
 * Check if running inside Antigravity's integrated terminal
 * Antigravity sets ANTIGRAVITY_CLI_ALIAS environment variable
 * Note: This check should be done FIRST before Cursor and VSCode
 */
export function isRunningInAntigravity(): boolean {
	return !!process.env.ANTIGRAVITY_CLI_ALIAS
}

/**
 * Check if VSCode command-line tool is available
 */
export async function isVSCodeAvailable(): Promise<boolean> {
	try {
		await execa('command', ['-v', 'code'], {
			shell: true,
			timeout: 5000,
		})
		return true
	} catch (error) {
		logger.debug('VSCode CLI not available', { error })
		return false
	}
}

/**
 * Check if Cursor command-line tool is available
 */
export async function isCursorAvailable(): Promise<boolean> {
	try {
		await execa('command', ['-v', 'cursor'], {
			shell: true,
			timeout: 5000,
		})
		return true
	} catch (error) {
		logger.debug('Cursor CLI not available', { error })
		return false
	}
}

/**
 * Check if Antigravity command-line tool is available
 */
export async function isAntigravityAvailable(): Promise<boolean> {
	try {
		await execa('command', ['-v', 'agy'], {
			shell: true,
			timeout: 5000,
		})
		return true
	} catch (error) {
		logger.debug('Antigravity CLI not available', { error })
		return false
	}
}

/**
 * Open VSCode window for workspace
 * Throws error if VSCode not available
 */
export async function openVSCodeWindow(workspacePath: string): Promise<void> {
	// Check availability first
	const available = await isVSCodeAvailable()
	if (!available) {
		throw new Error(
			'VSCode is not available. Please install VSCode and ensure the "code" command is in your PATH.\n' +
				'Install command-line tools: Open VSCode > Command Palette > "Shell Command: Install \'code\' command in PATH"'
		)
	}

	try {
		// Launch VSCode with workspace path
		await execa('code', [workspacePath])
		logger.debug(`Opened VSCode for workspace: ${workspacePath}`)
	} catch (error) {
		throw new Error(
			`Failed to open VSCode: ${error instanceof Error ? error.message : 'Unknown error'}`
		)
	}
}
