import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { openTerminalWindow, openMultipleTerminalWindows } from '../utils/terminal.js'
import type { TerminalWindowOptions } from '../utils/terminal.js'
import { openIdeWindow } from '../utils/ide.js'
import { getDevServerLaunchCommand } from '../utils/dev-server.js'
import { generateColorFromBranchName, hexToRgb } from '../utils/color.js'
import { logger as defaultLogger, type Logger } from '../utils/logger.js'
import { ClaudeContextManager } from './ClaudeContextManager.js'
import type { SettingsManager } from './SettingsManager.js'
import type { Capability } from '../types/loom.js'
import { getDotenvFlowFiles } from '../utils/env.js'

export interface LaunchLoomOptions {
	enableClaude: boolean
	enableCode: boolean
	enableDevServer: boolean
	enableTerminal: boolean
	worktreePath: string
	branchName: string
	port?: number
	capabilities: Capability[]
	workflowType: 'issue' | 'pr' | 'regular'
	identifier: string | number
	title?: string
	oneShot?: import('../types/index.js').OneShotMode
	setArguments?: string[] // Raw --set arguments to forward
	executablePath?: string // Executable path to use for spin command
	sourceEnvOnStart?: boolean // defaults to false if undefined
	colorTerminal?: boolean // defaults to true if undefined
	colorHex?: string // Pre-calculated hex color from metadata, avoids recalculation
}

/**
 * LoomLauncher orchestrates opening loom components
 */
export class LoomLauncher {
	private claudeContext: ClaudeContextManager
	private settings?: SettingsManager
	private logger: Logger

	constructor(claudeContext?: ClaudeContextManager, settings?: SettingsManager, logger?: Logger) {
		this.logger = logger ?? defaultLogger
		this.claudeContext = claudeContext ?? new ClaudeContextManager()
		if (settings !== undefined) {
			this.settings = settings
		}
	}

	/**
	 * Launch loom components based on individual flags
	 */
	async launchLoom(options: LaunchLoomOptions): Promise<void> {
		const { enableClaude, enableCode, enableDevServer, enableTerminal } = options

		this.logger.debug(`Launching loom components: Claude=${enableClaude}, Code=${enableCode}, DevServer=${enableDevServer}, Terminal=${enableTerminal}`)

		const launchPromises: Promise<void>[] = []

		// Launch VSCode if enabled
		if (enableCode) {
			this.logger.debug('Launching VSCode')
			launchPromises.push(this.launchVSCode(options))
		}

		// Build array of terminals to launch
		const terminalsToLaunch: Array<{
			type: 'claude' | 'devServer' | 'terminal'
			options: TerminalWindowOptions
		}> = []

		if (enableDevServer) {
			terminalsToLaunch.push({
				type: 'devServer',
				options: await this.buildDevServerTerminalOptions(options),
			})
		}

		if (enableTerminal) {
			terminalsToLaunch.push({
				type: 'terminal',
				options: this.buildStandaloneTerminalOptions(options),
			})
		}

		if (enableClaude) {
			terminalsToLaunch.push({
				type: 'claude',
				options: await this.buildClaudeTerminalOptions(options),
			})
		}

		// Launch terminals based on count
		if (terminalsToLaunch.length > 1) {
			// Multiple terminals - launch as tabs in single window
			this.logger.debug(`Launching ${terminalsToLaunch.length} terminals in single window`)
			launchPromises.push(this.launchMultipleTerminals(terminalsToLaunch, options))
		} else if (terminalsToLaunch.length === 1) {
			// Single terminal - launch standalone
			const terminal = terminalsToLaunch[0]
			if (!terminal) {
				throw new Error('Terminal configuration is undefined')
			}
			const terminalType = terminal.type
			this.logger.debug(`Launching single ${terminalType} terminal`)

			if (terminalType === 'claude') {
				launchPromises.push(this.launchClaudeTerminal(options))
			} else if (terminalType === 'devServer') {
				launchPromises.push(this.launchDevServerTerminal(options))
			} else {
				launchPromises.push(this.launchStandaloneTerminal(options))
			}
		}

		// Wait for all components to launch
		await Promise.all(launchPromises)

		this.logger.success('loom launched successfully')
	}

	/**
	 * Launch IDE (VSCode or configured alternative)
	 */
	private async launchVSCode(options: LaunchLoomOptions): Promise<void> {
		const ideConfig = await this.settings?.loadSettings().then((s) => s.ide)
		await openIdeWindow(options.worktreePath, ideConfig)
		this.logger.info('IDE opened')
	}

	/**
	 * Launch Claude terminal
	 */
	private async launchClaudeTerminal(options: LaunchLoomOptions): Promise<void> {
		await this.claudeContext.launchWithContext({
			workspacePath: options.worktreePath,
			type: options.workflowType,
			identifier: options.identifier,
			branchName: options.branchName,
			...(options.title && { title: options.title }),
			...(options.port !== undefined && { port: options.port }),
			oneShot: options.oneShot ?? 'default',
			...(options.setArguments && { setArguments: options.setArguments }),
			...(options.executablePath && { executablePath: options.executablePath }),
		})
		this.logger.info('Claude terminal opened')
	}

	/**
	 * Launch dev server terminal
	 */
	private async launchDevServerTerminal(options: LaunchLoomOptions): Promise<void> {
		const devServerCommand = await getDevServerLaunchCommand(
			options.worktreePath,
			options.port,
			options.capabilities
		)

		// Only generate color if terminal coloring is enabled (default: true)
		const backgroundColor = (options.colorTerminal ?? true)
			? options.colorHex
				? hexToRgb(options.colorHex)
				: generateColorFromBranchName(options.branchName).rgb
			: undefined

		await openTerminalWindow({
			workspacePath: options.worktreePath,
			command: devServerCommand,
			...(backgroundColor && { backgroundColor }),
			includeEnvSetup: (options.sourceEnvOnStart ?? false) && this.hasAnyEnvFiles(options.worktreePath),
			includePortExport: options.capabilities.includes('web'),
			...(options.port !== undefined && { port: options.port }),
		})
		this.logger.info('Dev server terminal opened')
	}

	/**
	 * Launch standalone terminal (no command, just workspace with env vars)
	 */
	private async launchStandaloneTerminal(options: LaunchLoomOptions): Promise<void> {
		// Only generate color if terminal coloring is enabled (default: true)
		const backgroundColor = (options.colorTerminal ?? true)
			? options.colorHex
				? hexToRgb(options.colorHex)
				: generateColorFromBranchName(options.branchName).rgb
			: undefined

		await openTerminalWindow({
			workspacePath: options.worktreePath,
			...(backgroundColor && { backgroundColor }),
			includeEnvSetup: (options.sourceEnvOnStart ?? false) && this.hasAnyEnvFiles(options.worktreePath),
			includePortExport: options.capabilities.includes('web'),
			...(options.port !== undefined && { port: options.port }),
		})
		this.logger.info('Standalone terminal opened')
	}

	/**
	 * Build terminal options for Claude
	 */
	private async buildClaudeTerminalOptions(
		options: LaunchLoomOptions
	): Promise<TerminalWindowOptions> {
		const hasEnvFile = this.hasAnyEnvFiles(options.worktreePath)
		const claudeTitle = `Claude - ${this.formatIdentifier(options.workflowType, options.identifier)}`

		const executable = options.executablePath ?? 'iloom'
		let claudeCommand = `${executable} spin`
		if (options.oneShot !== undefined && options.oneShot !== 'default') {
			claudeCommand += ` --one-shot=${options.oneShot}`
		}
		if (options.setArguments && options.setArguments.length > 0) {
			for (const setArg of options.setArguments) {
				claudeCommand += ` --set ${setArg}`
			}
		}

		// Only generate color if terminal coloring is enabled (default: true)
		const backgroundColor = (options.colorTerminal ?? true)
			? options.colorHex
				? hexToRgb(options.colorHex)
				: generateColorFromBranchName(options.branchName).rgb
			: undefined

		return {
			workspacePath: options.worktreePath,
			command: claudeCommand,
			...(backgroundColor && { backgroundColor }),
			title: claudeTitle,
			includeEnvSetup: (options.sourceEnvOnStart ?? false) && hasEnvFile,
			...(options.port !== undefined && { port: options.port, includePortExport: true }),
		}
	}

	/**
	 * Build terminal options for dev server
	 */
	private async buildDevServerTerminalOptions(
		options: LaunchLoomOptions
	): Promise<TerminalWindowOptions> {
		const devServerCommand = await getDevServerLaunchCommand(
			options.worktreePath,
			options.port,
			options.capabilities
		)
		const hasEnvFile = this.hasAnyEnvFiles(options.worktreePath)
		const devServerTitle = `Dev Server - ${this.formatIdentifier(options.workflowType, options.identifier)}`

		// Only generate color if terminal coloring is enabled (default: true)
		const backgroundColor = (options.colorTerminal ?? true)
			? options.colorHex
				? hexToRgb(options.colorHex)
				: generateColorFromBranchName(options.branchName).rgb
			: undefined

		return {
			workspacePath: options.worktreePath,
			command: devServerCommand,
			...(backgroundColor && { backgroundColor }),
			title: devServerTitle,
			includeEnvSetup: (options.sourceEnvOnStart ?? false) && hasEnvFile,
			includePortExport: options.capabilities.includes('web'),
			...(options.port !== undefined && { port: options.port }),
		}
	}

	/**
	 * Build terminal options for standalone terminal (no command)
	 */
	private buildStandaloneTerminalOptions(
		options: LaunchLoomOptions
	): TerminalWindowOptions {
		const hasEnvFile = this.hasAnyEnvFiles(options.worktreePath)
		const terminalTitle = `Terminal - ${this.formatIdentifier(options.workflowType, options.identifier)}`

		// Only generate color if terminal coloring is enabled (default: true)
		const backgroundColor = (options.colorTerminal ?? true)
			? options.colorHex
				? hexToRgb(options.colorHex)
				: generateColorFromBranchName(options.branchName).rgb
			: undefined

		return {
			workspacePath: options.worktreePath,
			...(backgroundColor && { backgroundColor }),
			title: terminalTitle,
			includeEnvSetup: (options.sourceEnvOnStart ?? false) && hasEnvFile,
			includePortExport: options.capabilities.includes('web'),
			...(options.port !== undefined && { port: options.port }),
		}
	}

	/**
	 * Launch multiple terminals (2+) as tabs in single window
	 */
	private async launchMultipleTerminals(
		terminals: Array<{ type: string; options: TerminalWindowOptions }>,
		_options: LaunchLoomOptions
	): Promise<void> {
		const terminalOptions = terminals.map((t) => t.options)

		await openMultipleTerminalWindows(terminalOptions)

		const terminalTypes = terminals.map((t) => t.type).join(' + ')
		this.logger.info(`Multiple terminals opened: ${terminalTypes}`)
	}

	/**
	 * Check if any dotenv-flow files exist in the workspace
	 * Checks all files: .env, .env.local, .env.{NODE_ENV}, .env.{NODE_ENV}.local
	 */
	private hasAnyEnvFiles(workspacePath: string): boolean {
		const envFiles = getDotenvFlowFiles()
		return envFiles.some(file => existsSync(join(workspacePath, file)))
	}

	/**
	 * Format identifier for terminal tab titles
	 */
	private formatIdentifier(workflowType: 'issue' | 'pr' | 'regular', identifier: string | number): string {
		if (workflowType === 'issue') {
			return `Issue #${identifier}`
		} else if (workflowType === 'pr') {
			return `PR #${identifier}`
		} else {
			return `Branch: ${identifier}`
		}
	}
}
