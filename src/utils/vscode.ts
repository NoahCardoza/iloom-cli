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
