import { readFile } from 'fs/promises'
import { accessSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { logger } from '../utils/logger.js'

// Agent schema interface
export interface AgentConfig {
	description: string
	prompt: string
	tools: string[]
	model: string
	color?: string
}

// Container for all loaded agents (keyed by agent name without extension)
export interface AgentConfigs {
	[agentName: string]: AgentConfig
}

export class AgentManager {
	private agentDir: string

	constructor(agentDir?: string) {
		if (agentDir) {
			this.agentDir = agentDir
		} else {
			// Find agents relative to package installation
			// Same pattern as PromptTemplateManager
			// When running from dist/, agents are copied to dist/agents/
			const currentFileUrl = import.meta.url
			const currentFilePath = fileURLToPath(currentFileUrl)
			const distDir = path.dirname(currentFilePath)

			// Walk up to find the agents directory
			let agentDirPath = path.join(distDir, 'agents')
			let currentDir = distDir

			while (currentDir !== path.dirname(currentDir)) {
				const candidatePath = path.join(currentDir, 'agents')
				try {
					accessSync(candidatePath)
					agentDirPath = candidatePath
					break
				} catch {
					currentDir = path.dirname(currentDir)
				}
			}

			this.agentDir = agentDirPath
			logger.debug('AgentManager initialized', { agentDir: this.agentDir })
		}
	}

	/**
	 * Load all agent configuration files
	 * Throws error if agents directory doesn't exist or files are malformed
	 */
	async loadAgents(): Promise<AgentConfigs> {
		// Load all .json files from the agents directory
		const { readdir } = await import('fs/promises')
		const files = await readdir(this.agentDir)
		const agentFiles = files.filter(file => file.endsWith('.json'))		

		const agents: AgentConfigs = {}

		for (const filename of agentFiles) {
			const agentPath = path.join(this.agentDir, filename)
			const agentName = path.basename(filename, '.json')

			try {
				const content = await readFile(agentPath, 'utf-8')
				const agentConfig = JSON.parse(content) as AgentConfig

				// Validate required fields
				this.validateAgentConfig(agentConfig, agentName)

				agents[agentName] = agentConfig
				logger.debug(`Loaded agent: ${agentName}`)
			} catch (error) {
				logger.error(`Failed to load agent ${agentName}`, { error })
				throw new Error(
					`Failed to load agent ${agentName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
				)
			}
		}

		return agents
	}

	/**
	 * Validate agent configuration has required fields
	 */
	private validateAgentConfig(config: AgentConfig, agentName: string): void {
		const requiredFields: (keyof AgentConfig)[] = ['description', 'prompt', 'tools', 'model']

		for (const field of requiredFields) {
			if (!config[field]) {
				throw new Error(`Agent ${agentName} missing required field: ${field}`)
			}
		}

		if (!Array.isArray(config.tools)) {
			throw new Error(`Agent ${agentName} tools must be an array`)
		}
	}

	/**
	 * Format loaded agents for Claude CLI --agents flag
	 * Returns object suitable for JSON.stringify
	 */
	formatForCli(agents: AgentConfigs): Record<string, unknown> {
		// The agents object is already in the correct format
		// Just return it - launchClaude will JSON.stringify it
		return agents as Record<string, unknown>
	}
}
