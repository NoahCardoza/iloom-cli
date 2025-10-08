import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { openTerminalWindow } from '../utils/terminal.js'
import { openVSCodeWindow } from '../utils/vscode.js'
import { getDevServerLaunchCommand } from '../utils/dev-server.js'
import { generateColorFromBranchName } from '../utils/color.js'
import { logger } from '../utils/logger.js'
import { ClaudeContextManager } from './ClaudeContextManager.js'
import type { Capability } from '../types/hatchbox.js'

export interface LaunchHatchboxOptions {
	enableClaude: boolean
	enableCode: boolean
	enableDevServer: boolean
	worktreePath: string
	branchName: string
	port?: number
	capabilities: Capability[]
	workflowType: 'issue' | 'pr' | 'regular'
	identifier: string | number
	title?: string
}

/**
 * HatchboxLauncher orchestrates opening hatchbox components
 */
export class HatchboxLauncher {
	private claudeContext: ClaudeContextManager

	constructor() {
		this.claudeContext = new ClaudeContextManager()
	}

	/**
	 * Launch hatchbox components based on individual flags
	 */
	async launchHatchbox(options: LaunchHatchboxOptions): Promise<void> {
		const { enableClaude, enableCode, enableDevServer } = options

		logger.debug(`Launching hatchbox components: Claude=${enableClaude}, Code=${enableCode}, DevServer=${enableDevServer}`)

		const launchPromises: Promise<void>[] = []

		// Launch VSCode if enabled
		if (enableCode) {
			logger.debug('Launching VSCode')
			launchPromises.push(this.launchVSCode(options))
		}

		// Launch terminal if Claude or dev server is enabled
		if (enableClaude || enableDevServer) {
			if (enableClaude && enableDevServer) {
				// Both Claude and dev server - launch dual terminals
				logger.debug('Launching dual terminals: Claude + dev server')
				launchPromises.push(this.launchDualTerminals(options))
			} else if (enableClaude) {
				// Claude only
				logger.debug('Launching Claude terminal')
				launchPromises.push(this.launchClaudeTerminal(options))
			} else {
				// Dev server only
				logger.debug('Launching dev server terminal')
				launchPromises.push(this.launchDevServerTerminal(options))
			}
		}

		// Wait for all components to launch
		await Promise.all(launchPromises)

		logger.success('Hatchbox launched successfully')
	}

	/**
	 * Launch VSCode
	 */
	private async launchVSCode(options: LaunchHatchboxOptions): Promise<void> {
		await openVSCodeWindow(options.worktreePath)
		logger.info('VSCode opened')
	}

	/**
	 * Launch Claude terminal
	 */
	private async launchClaudeTerminal(options: LaunchHatchboxOptions): Promise<void> {
		await this.claudeContext.launchWithContext({
			workspacePath: options.worktreePath,
			type: options.workflowType,
			identifier: options.identifier,
			branchName: options.branchName,
			...(options.title && { title: options.title }),
			...(options.port !== undefined && { port: options.port }),
		})
		logger.info('Claude terminal opened')
	}

	/**
	 * Launch dev server terminal
	 */
	private async launchDevServerTerminal(options: LaunchHatchboxOptions): Promise<void> {
		const colorData = generateColorFromBranchName(options.branchName)
		const devServerCommand = await getDevServerLaunchCommand(
			options.worktreePath,
			options.port,
			options.capabilities
		)

		await openTerminalWindow({
			workspacePath: options.worktreePath,
			command: devServerCommand,
			backgroundColor: colorData.rgb,
			includeEnvSetup: existsSync(join(options.worktreePath, '.env')),
			includePortExport: options.capabilities.includes('web'),
			...(options.port !== undefined && { port: options.port }),
		})
		logger.info('Dev server terminal opened')
	}

	/**
	 * Launch dual terminals: Claude + dev server
	 */
	private async launchDualTerminals(options: LaunchHatchboxOptions): Promise<void> {
		// First terminal: Claude with context
		await this.launchClaudeTerminal(options)

		// Brief pause to let first terminal initialize
		logger.debug('Waiting 1 second before opening second terminal...')
		// eslint-disable-next-line no-undef
		await new Promise<void>((resolve) => setTimeout(resolve, 1000))

		// Second terminal: dev server
		await this.launchDevServerTerminal(options)

		logger.info('Dual terminals opened: Claude + dev server')
	}
}
