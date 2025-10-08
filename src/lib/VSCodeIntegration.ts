import fs from 'fs-extra'
import path from 'path'
import { parse, modify, applyEdits } from 'jsonc-parser'
import { logger } from '../utils/logger.js'

/**
 * VSCode settings structure
 */
interface VSCodeSettings {
	'workbench.colorCustomizations'?: {
		'titleBar.activeBackground'?: string
		'titleBar.activeForeground'?: string
		[key: string]: string | undefined
	}
	[key: string]: unknown
}

/**
 * Manages VSCode settings.json manipulation for workspace color synchronization
 */
export class VSCodeIntegration {
	/**
	 * Set VSCode title bar color for a workspace
	 *
	 * @param workspacePath - Path to workspace directory
	 * @param hexColor - Hex color string (e.g., "#dcebf8")
	 */
	async setTitleBarColor(workspacePath: string, hexColor: string): Promise<void> {
		const vscodeDir = path.join(workspacePath, '.vscode')
		const settingsPath = path.join(vscodeDir, 'settings.json')

		try {
			// Ensure .vscode directory exists
			await fs.ensureDir(vscodeDir)

			// Read existing settings (or create empty object)
			const settings = await this.readSettings(settingsPath)

			// Merge color settings
			const updatedSettings = this.mergeColorSettings(settings, hexColor)

			// Write settings atomically
			await this.writeSettings(settingsPath, updatedSettings)

			logger.debug(`Set VSCode title bar color to ${hexColor} for ${workspacePath}`)
		} catch (error) {
			throw new Error(
				`Failed to set VSCode title bar color: ${error instanceof Error ? error.message : 'Unknown error'}`
			)
		}
	}

	/**
	 * Reset VSCode title bar color (remove color customizations)
	 *
	 * @param workspacePath - Path to workspace directory
	 */
	async resetTitleBarColor(workspacePath: string): Promise<void> {
		const settingsPath = path.join(workspacePath, '.vscode', 'settings.json')

		try {
			// Check if settings file exists
			if (!(await fs.pathExists(settingsPath))) {
				logger.debug('No settings.json to reset')
				return
			}

			// Read existing settings
			const settings = await this.readSettings(settingsPath)

			// Remove title bar colors
			if (settings['workbench.colorCustomizations']) {
				delete settings['workbench.colorCustomizations']['titleBar.activeBackground']
				delete settings['workbench.colorCustomizations']['titleBar.activeForeground']

				// Remove empty workbench.colorCustomizations object
				if (Object.keys(settings['workbench.colorCustomizations']).length === 0) {
					delete settings['workbench.colorCustomizations']
				}
			}

			// Write updated settings
			await this.writeSettings(settingsPath, settings)

			logger.debug(`Reset VSCode title bar color for ${workspacePath}`)
		} catch (error) {
			throw new Error(
				`Failed to reset VSCode title bar color: ${error instanceof Error ? error.message : 'Unknown error'}`
			)
		}
	}

	/**
	 * Read VSCode settings from file
	 * Supports JSONC (JSON with Comments)
	 *
	 * @param settingsPath - Path to settings.json file
	 * @returns Parsed settings object
	 */
	private async readSettings(settingsPath: string): Promise<VSCodeSettings> {
		try {
			// Check if file exists
			if (!(await fs.pathExists(settingsPath))) {
				return {}
			}

			// Read file content
			const content = await fs.readFile(settingsPath, 'utf8')

			// Parse JSONC (handles comments)
			const errors: import('jsonc-parser').ParseError[] = []
			const settings = parse(content, errors, { allowTrailingComma: true })

			// Check for parse errors
			if (errors.length > 0) {
				const firstError = errors[0]
				throw new Error(`Invalid JSON: ${firstError ? firstError.error : 'Unknown parse error'}`)
			}

			return settings ?? {}
		} catch (error) {
			throw new Error(
				`Failed to parse settings.json: ${error instanceof Error ? error.message : 'Unknown error'}`
			)
		}
	}

	/**
	 * Write VSCode settings to file atomically
	 * Preserves comments if present (using JSONC parser)
	 *
	 * @param settingsPath - Path to settings.json file
	 * @param settings - Settings object to write
	 */
	private async writeSettings(
		settingsPath: string,
		settings: VSCodeSettings
	): Promise<void> {
		try {
			let content: string

			// Check if file exists with comments
			if (await fs.pathExists(settingsPath)) {
				const existingContent = await fs.readFile(settingsPath, 'utf8')

				// Try to preserve comments by using jsonc-parser's modify function
				if (existingContent.includes('//') || existingContent.includes('/*')) {
					// File has comments - use JSONC modify to preserve them
					content = await this.modifyWithCommentsPreserved(existingContent, settings)
				} else {
					// No comments - use standard JSON.stringify
					content = JSON.stringify(settings, null, 2) + '\n'
				}
			} else {
				// New file - use standard JSON.stringify
				content = JSON.stringify(settings, null, 2) + '\n'
			}

			// Write atomically using temp file + rename
			const tempPath = `${settingsPath}.tmp`
			await fs.writeFile(tempPath, content, 'utf8')
			await fs.rename(tempPath, settingsPath)
		} catch (error) {
			throw new Error(
				`Failed to write settings.json: ${error instanceof Error ? error.message : 'Unknown error'}`
			)
		}
	}

	/**
	 * Modify JSONC content while preserving comments
	 *
	 * @param existingContent - Original JSONC content
	 * @param newSettings - New settings to apply
	 * @returns Modified JSONC content with comments preserved
	 */
	private async modifyWithCommentsPreserved(
		existingContent: string,
		newSettings: VSCodeSettings
	): Promise<string> {
		let modifiedContent = existingContent

		// Apply each setting modification
		for (const [key, value] of Object.entries(newSettings)) {
			const edits = modify(modifiedContent, [key], value, {})
			modifiedContent = applyEdits(modifiedContent, edits)
		}

		return modifiedContent
	}

	/**
	 * Merge color settings into existing settings object
	 *
	 * @param existing - Existing settings object
	 * @param hexColor - Hex color to apply
	 * @returns Updated settings object with color merged
	 */
	private mergeColorSettings(existing: VSCodeSettings, hexColor: string): VSCodeSettings {
		// Clone existing settings
		const updated: VSCodeSettings = { ...existing }

		// Initialize workbench.colorCustomizations if needed
		updated['workbench.colorCustomizations'] ??= {}

		// Set title bar colors
		updated['workbench.colorCustomizations']['titleBar.activeBackground'] = hexColor
		updated['workbench.colorCustomizations']['titleBar.activeForeground'] = '#000000'

		return updated
	}
}
