import { execa } from 'execa'
import { logger } from './logger.js'
import type { IdeSettings } from '../lib/SettingsManager.js'

// IDE preset configuration
const IDE_PRESETS = {
	vscode: { command: 'code', name: 'Visual Studio Code', args: [] },
	cursor: { command: 'cursor', name: 'Cursor', args: [] },
	webstorm: { command: 'webstorm', name: 'WebStorm', args: ['--nosplash'] },
	sublime: { command: 'subl', name: 'Sublime Text', args: [] },
	intellij: { command: 'idea', name: 'IntelliJ IDEA', args: ['--nosplash'] },
	windsurf: { command: 'surf', name: 'Windsurf', args: [] },
} as const

type IdePreset = keyof typeof IDE_PRESETS

// Resolve IDE configuration to command and args
export function getIdeConfig(ideSettings?: IdeSettings): {
	command: string
	args: string[]
	name: string
} {
	// Default to vscode if not configured
	const type = ideSettings?.type ?? 'vscode'

	const preset = IDE_PRESETS[type as IdePreset]
	return {
		command: preset.command,
		args: [...preset.args],
		name: preset.name,
	}
}

// Check if IDE is available
export async function isIdeAvailable(command: string): Promise<boolean> {
	try {
		await execa('command', ['-v', command], { shell: true, timeout: 5000 })
		return true
	} catch {
		return false
	}
}

// Get installation hint for IDE
function getInstallHint(type: string): string {
	const hints: Record<string, string> = {
		vscode:
			'Install command-line tools: Open VSCode > Command Palette > "Shell Command: Install \'code\' command in PATH"',
		cursor:
			'Install command-line tools: Open Cursor > Command Palette > "Install \'cursor\' command in PATH"',
		webstorm: 'Install via JetBrains Toolbox > Settings > Shell Scripts > Enable',
		sublime:
			'Create symlink: ln -s "/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl" /usr/local/bin/subl',
		intellij: 'Install via JetBrains Toolbox > Settings > Shell Scripts > Enable',
		windsurf:
			'Install command-line tools during Windsurf installation or create symlink manually',
	}
	return hints[type] ?? `Ensure the IDE command is available in your PATH`
}

// Open IDE window for workspace
export async function openIdeWindow(
	workspacePath: string,
	ideSettings?: IdeSettings
): Promise<void> {
	const config = getIdeConfig(ideSettings)
	const available = await isIdeAvailable(config.command)

	if (!available) {
		const type = ideSettings?.type ?? 'vscode'
		throw new Error(
			`${config.name} is not available. The "${config.command}" command was not found in PATH.\n` +
				getInstallHint(type)
		)
	}

	try {
		await execa(config.command, [...config.args, workspacePath])
		logger.debug(`Opened ${config.name} for workspace: ${workspacePath}`)
	} catch (error) {
		throw new Error(
			`Failed to open ${config.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
		)
	}
}
