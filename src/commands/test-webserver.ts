import { logger } from '../utils/logger.js'
import { ProcessManager } from '../lib/process/ProcessManager.js'
import { SettingsManager } from '../lib/SettingsManager.js'

export interface TestWebserverOptions {
	kill?: boolean
}

export interface TestWebserverCommandInput {
	issueNumber: string | number
	options: TestWebserverOptions
}

/**
 * Command to test if a web server is running on a workspace port
 * and optionally kill it if detected.
 *
 * This uses the ProcessManager to detect processes on ports and
 * safely terminate web servers when requested.
 */
export class TestWebserverCommand {
	private readonly settingsManager: SettingsManager
	private processManager: ProcessManager | null

	constructor(processManager?: ProcessManager, settingsManager?: SettingsManager) {
		this.settingsManager = settingsManager ?? new SettingsManager()
		this.processManager = processManager ?? null
	}

	/**
	 * Get or create ProcessManager with correct basePort from settings
	 */
	private async getProcessManager(): Promise<ProcessManager> {
		if (this.processManager) {
			return this.processManager
		}
		const settings = await this.settingsManager.loadSettings()
		const basePort = settings.capabilities?.web?.basePort ?? 3000
		this.processManager = new ProcessManager(basePort)
		return this.processManager
	}

	/**
	 * Main entry point for the test-webserver command
	 */
	public async execute(input: TestWebserverCommandInput): Promise<void> {
		const { issueNumber, options } = input

		// Validate issue number - test-webserver requires numeric for port calculation
		if (typeof issueNumber !== 'number' || !Number.isInteger(issueNumber) || issueNumber <= 0) {
			throw new Error('Issue number must be a positive integer for port calculation')
		}

		// Get ProcessManager (will load settings to get basePort if needed)
		const processManager = await this.getProcessManager()

		// Calculate port from issue number
		const port = processManager.calculatePort(issueNumber)
		logger.info(`Checking port ${port} (issue #${issueNumber})...`)

		// Detect what's running on the port
		const processInfo = await processManager.detectDevServer(port)

		if (!processInfo) {
			logger.info(`No process found on port ${port}`)
			return
		}

		// Report what we found
		logger.info(`Found process on port ${port}:`)
		logger.info(`   PID: ${processInfo.pid}`)
		logger.info(`   Name: ${processInfo.name}`)
		logger.info(`   Command: ${processInfo.command}`)

		if (processInfo.isDevServer) {
			logger.success(`Detected as web server`)
		} else {
			logger.warn(`Not detected as web server`)
			logger.info(`This appears to be a non-web-server process. Skipping for safety.`)
		}

		// Kill process if requested (and it's a web server)
		if (options.kill) {
			if (!processInfo.isDevServer) {
				logger.error(`Cannot kill non-web-server process (PID ${processInfo.pid}) for safety reasons`)
				logger.info(`Process must match web server patterns to be killed automatically`)
				throw new Error('Cannot kill non-web-server process')
			}

			logger.info(`Terminating web server (PID ${processInfo.pid})...`)
			const terminated = await processManager.terminateProcess(processInfo.pid)

			if (terminated) {
				logger.success(`Web server terminated successfully`)

				// Verify port is now free
				const isFree = await processManager.verifyPortFree(port)
				if (isFree) {
					logger.success(`Port ${port} is now free`)
				} else {
					logger.warn(`Port ${port} may still be in use (TIME_WAIT state)`)
				}
			}
		}
	}
}
