import { execa, type ExecaChildProcess } from 'execa'
import { setTimeout } from 'timers/promises'
import { ProcessManager } from './process/ProcessManager.js'
import { buildDevServerCommand } from '../utils/dev-server.js'
import { logger } from '../utils/logger.js'

export interface DevServerManagerOptions {
	/**
	 * Maximum time to wait for server to start (in milliseconds)
	 * Default: 30000 (30 seconds)
	 */
	startupTimeout?: number

	/**
	 * Interval between port checks (in milliseconds)
	 * Default: 1000 (1 second)
	 */
	checkInterval?: number
}

/**
 * DevServerManager handles auto-starting and monitoring dev servers
 * Used by open/run commands to ensure dev server is running before opening browser
 */
export class DevServerManager {
	private readonly processManager: ProcessManager
	private readonly options: Required<DevServerManagerOptions>
	private runningServers: Map<number, ExecaChildProcess> = new Map()

	constructor(
		processManager?: ProcessManager,
		options: DevServerManagerOptions = {}
	) {
		this.processManager = processManager ?? new ProcessManager()
		this.options = {
			startupTimeout: options.startupTimeout ?? 30000,
			checkInterval: options.checkInterval ?? 1000,
		}
	}

	/**
	 * Ensure dev server is running on the specified port
	 * If not running, start it and wait for it to be ready
	 *
	 * @param worktreePath - Path to the worktree
	 * @param port - Port the server should run on
	 * @returns true if server is ready, false if startup failed/timed out
	 */
	async ensureServerRunning(worktreePath: string, port: number): Promise<boolean> {
		logger.debug(`Checking if dev server is running on port ${port}...`)

		// Check if already running
		const existingProcess = await this.processManager.detectDevServer(port)
		if (existingProcess) {
			logger.debug(
				`Dev server already running on port ${port} (PID: ${existingProcess.pid})`
			)
			return true
		}

		// Not running - start it
		logger.info(`Dev server not running on port ${port}, starting...`)

		try {
			await this.startDevServer(worktreePath, port)
			return true
		} catch (error) {
			logger.error(
				`Failed to start dev server: ${error instanceof Error ? error.message : 'Unknown error'}`
			)
			return false
		}
	}

	/**
	 * Start dev server in background and wait for it to be ready
	 */
	private async startDevServer(worktreePath: string, port: number): Promise<void> {
		// Build dev server command
		const devCommand = await buildDevServerCommand(worktreePath)
		logger.debug(`Starting dev server with command: ${devCommand}`)

		// Start server in background
		const serverProcess = execa('sh', ['-c', devCommand], {
			cwd: worktreePath,
			env: {
				...process.env,
				PORT: port.toString(),
			},
			// Important: Don't inherit stdio - server runs in background
			stdio: 'ignore',
			// Detach from parent process so it continues running
			detached: true,
		})

		// Store reference to prevent cleanup
		this.runningServers.set(port, serverProcess)

		// Unref so parent can exit
		serverProcess.unref()

		// Wait for server to be ready
		logger.info(`Waiting for dev server to start on port ${port}...`)
		const ready = await this.waitForServerReady(port)

		if (!ready) {
			throw new Error(
				`Dev server failed to start within ${this.options.startupTimeout}ms timeout`
			)
		}

		logger.success(`Dev server started successfully on port ${port}`)
	}

	/**
	 * Wait for server to be ready by polling the port
	 */
	private async waitForServerReady(port: number): Promise<boolean> {
		const startTime = Date.now()
		let attempts = 0

		while (Date.now() - startTime < this.options.startupTimeout) {
			attempts++

			// Check if server is listening
			const processInfo = await this.processManager.detectDevServer(port)

			if (processInfo) {
				logger.debug(
					`Server detected on port ${port} after ${attempts} attempts (${Date.now() - startTime}ms)`
				)
				return true
			}

			// Wait before next check
			await setTimeout(this.options.checkInterval)
		}

		// Timeout
		logger.warn(
			`Server did not start on port ${port} after ${this.options.startupTimeout}ms (${attempts} attempts)`
		)
		return false
	}

	/**
	 * Clean up all running server processes
	 * This should be called when the manager is being disposed
	 */
	async cleanup(): Promise<void> {
		for (const [port, serverProcess] of this.runningServers.entries()) {
			try {
				logger.debug(`Cleaning up server process on port ${port}`)
				serverProcess.kill()
			} catch (error) {
				logger.warn(
					`Failed to kill server process on port ${port}: ${error instanceof Error ? error.message : 'Unknown error'}`
				)
			}
		}
		this.runningServers.clear()
	}
}
