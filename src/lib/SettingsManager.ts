import { readFile } from 'fs/promises'
import path from 'path'
import { logger } from '../utils/logger.js'

/**
 * Settings for individual agents
 */
export interface AgentSettings {
	model?: string
	// Future: could add other per-agent overrides
}

/**
 * Structure of the Hatchbox settings file
 */
export interface HatchboxSettings {
	mainBranch?: string
	agents?: {
		[agentName: string]: AgentSettings
	}
}

/**
 * Manages project-level settings from .hatchbox/settings.json
 */
export class SettingsManager {
	private readonly validModels = ['sonnet', 'opus', 'haiku']

	/**
	 * Load settings from <PROJECT_ROOT>/.hatchbox/settings.json
	 * Returns empty object if file doesn't exist (not an error)
	 */
	async loadSettings(projectRoot?: string): Promise<HatchboxSettings> {
		const root = this.getProjectRoot(projectRoot)
		const settingsPath = this.getSettingsPath(root)

		try {
			const content = await readFile(settingsPath, 'utf-8')
			let settings: unknown

			try {
				settings = JSON.parse(content)
			} catch (error) {
				throw new Error(
					`Failed to parse settings file at ${settingsPath}: ${error instanceof Error ? error.message : 'Invalid JSON'}`,
				)
			}

			if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
				throw new Error(
					`Settings file must be a JSON object, got ${typeof settings} at ${settingsPath}`,
				)
			}

			const typedSettings = settings as HatchboxSettings
			this.validateSettings(typedSettings)

			return typedSettings
		} catch (error) {
			// File not found is not an error - return empty settings
			if ((error as { code?: string }).code === 'ENOENT') {
				logger.debug(`No settings file found at ${settingsPath}, using defaults`)
				return {}
			}

			// Re-throw validation or parsing errors
			throw error
		}
	}

	/**
	 * Validate settings structure and model names
	 */
	private validateSettings(settings: HatchboxSettings): void {
		// Validate mainBranch if present
		if (settings.mainBranch !== undefined) {
			if (typeof settings.mainBranch !== 'string') {
				throw new Error(
					`Settings 'mainBranch' must be a string, got ${typeof settings.mainBranch}`,
				)
			}
			if (settings.mainBranch.trim() === '') {
				throw new Error(`Settings 'mainBranch' cannot be empty`)
			}
		}

		if (settings.agents !== undefined && settings.agents !== null) {
			if (typeof settings.agents !== 'object' || Array.isArray(settings.agents)) {
				throw new Error(
					`Settings 'agents' field must be an object, got ${typeof settings.agents}`,
				)
			}

			// Validate each agent's settings
			for (const [agentName, agentSettings] of Object.entries(settings.agents)) {
				if (agentSettings.model) {
					if (!this.validModels.includes(agentSettings.model)) {
						throw new Error(
							`Agent '${agentName}' has invalid model '${agentSettings.model}'. ` +
								`Valid models are: ${this.validModels.join(', ')}`,
						)
					}
				}
			}
		}
	}

	/**
	 * Get project root (defaults to process.cwd())
	 */
	private getProjectRoot(projectRoot?: string): string {
		return projectRoot ?? process.cwd()
	}

	/**
	 * Get settings file path
	 */
	private getSettingsPath(projectRoot: string): string {
		return path.join(projectRoot, '.hatchbox', 'settings.json')
	}
}
