import { logger } from '../utils/logger.js'
import { checkGhAuth, executeGhCommand } from '../utils/github.js'
import { executeGitCommand } from '../utils/git.js'
import { promptInput } from '../utils/prompt.js'
import { existsSync, accessSync, constants } from 'fs'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { InitCommand } from './init.js'
import chalk from 'chalk'

const ILOOM_REPO = 'iloom-ai/iloom-cli'
const UPSTREAM_URL = 'https://github.com/iloom-ai/iloom-cli.git'

// Maximum path length for most file systems
const MAX_PATH_LENGTH = 255

// Reserved names on Windows (also avoid on all platforms for portability)
const RESERVED_NAMES = [
	'CON', 'PRN', 'AUX', 'NUL',
	'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
	'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]

// Invalid characters for directory names (cross-platform)
// eslint-disable-next-line no-control-regex
const INVALID_CHARS_PATTERN = /[<>:"|?*\x00-\x1f]/


/**
 * Validation result for directory input
 */
interface DirectoryValidationResult {
	isValid: boolean
	error?: string
}

/**
 * Validate directory name format
 * @param directoryName - The directory name (not full path)
 * @returns Validation result with error message if invalid
 */
export function validateDirectoryName(directoryName: string): DirectoryValidationResult {
	// Check for empty or whitespace-only
	if (!directoryName || directoryName.trim() === '') {
		return { isValid: false, error: 'Directory name cannot be empty' }
	}

	const trimmed = directoryName.trim()
	const baseName = path.basename(trimmed)

	// Check for invalid characters
	if (INVALID_CHARS_PATTERN.test(baseName)) {
		return { isValid: false, error: 'Directory name contains invalid characters (<>:"|?*)' }
	}

	// Check for reserved names (case-insensitive)
	if (RESERVED_NAMES.includes(baseName.toUpperCase())) {
		return { isValid: false, error: `"${baseName}" is a reserved name and cannot be used` }
	}

	// Check for names that start/end with dots or spaces (problematic on some systems)
	if (baseName.startsWith('.') && baseName === '.') {
		return { isValid: false, error: 'Directory name cannot be just a dot' }
	}
	if (baseName.endsWith('.') || baseName.endsWith(' ')) {
		return { isValid: false, error: 'Directory name cannot end with a dot or space' }
	}

	return { isValid: true }
}

/**
 * Validate full directory path
 * @param directoryPath - The full directory path
 * @returns Validation result with error message if invalid
 */
export function validateDirectoryPath(directoryPath: string): DirectoryValidationResult {
	// First validate the directory name component
	const nameValidation = validateDirectoryName(directoryPath)
	if (!nameValidation.isValid) {
		return nameValidation
	}

	const trimmed = directoryPath.trim()
	const absolutePath = path.resolve(trimmed)

	// Check path length
	if (absolutePath.length > MAX_PATH_LENGTH) {
		return {
			isValid: false,
			error: `Path is too long (${absolutePath.length} characters). Maximum is ${MAX_PATH_LENGTH} characters.`
		}
	}

	// Check if directory already exists
	if (existsSync(absolutePath)) {
		return { isValid: false, error: `Directory already exists: ${trimmed}` }
	}

	// Check if parent directory exists
	const parentDir = path.dirname(absolutePath)
	if (!existsSync(parentDir)) {
		return { isValid: false, error: `Parent directory does not exist: ${parentDir}` }
	}

	// Check if parent directory is writable
	try {
		accessSync(parentDir, constants.W_OK)
	} catch {
		return { isValid: false, error: `Parent directory is not writable: ${parentDir}` }
	}

	return { isValid: true }
}


/**
 * ContributeCommand - Set up local development environment for contributing to iloom
 * Implements issue #220: streamlined contributor onboarding workflow
 */
export class ContributeCommand {
	constructor(_initCommand?: InitCommand) {}

	/**
	 * Main entry point for the contribute command
	 * Automates fork creation, cloning, and upstream configuration
	 */
	public async execute(): Promise<void> {
		logger.info(chalk.bold('Setting up iloom contributor environment...'))

		// Step 1: Verify gh CLI authenticated
		const username = await this.getAuthenticatedUsername()
		logger.success(`Authenticated as ${chalk.cyan(username)}`)

		// Step 2: Check for existing fork
		const hasFork = await this.forkExists(username)

		// Step 3: Create fork if needed
		if (!hasFork) {
			logger.info('Creating fork of iloom-ai/iloom-cli...')
			await this.createFork()
			logger.success('Fork created successfully')
		} else {
			logger.info('Using existing fork')
		}

		// Step 4: Prompt for directory with validation and retry loop
		const directory = await this.promptForDirectory()

		// Handle cancelled input
		if (!directory) {
			logger.info('Setup cancelled by user')
			process.exit(0)
		}

		const absolutePath = path.resolve(directory)

		// Step 5: Clone repository (gh CLI handles SSH/HTTPS automatically based on git config)
		logger.info(`Cloning repository to ${directory}...`)
		await this.cloneRepository(username, directory)
		logger.success('Repository cloned successfully')

		// Step 6: Add upstream remote if it doesn't exist
		await this.addUpstreamRemote(absolutePath)

		// Step 7: Configure settings
		logger.info('Configuring iloom settings...')
		await this.configureSettings(absolutePath)
		logger.success('Settings configured')

		logger.success(chalk.bold.green('\nContributor environment setup complete!'))
		logger.info(`\nNext steps:`)
		logger.info(`  1. cd ${directory}`)
		logger.info(`  2. pnpm install`)
		logger.info(`  3. iloom start <issue_number>`)
		logger.info(`\nHappy contributing!`)
	}

	/**
	 * Get authenticated GitHub username
	 * @throws Error if not authenticated
	 */
	private async getAuthenticatedUsername(): Promise<string> {
		const authStatus = await checkGhAuth()

		if (!authStatus.hasAuth) {
			throw new Error(
				'GitHub CLI is not authenticated. Please run: gh auth login'
			)
		}

		if (!authStatus.username) {
			// Try to fetch username from gh api if not in auth status
			try {
				const user = await executeGhCommand<{ login: string }>(['api', 'user', '--json', 'login'])
				return user.login
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				throw new Error(`Unable to determine GitHub username: ${message}`)
			}
		}

		return authStatus.username
	}

	/**
	 * Check if user already has a fork of iloom-cli
	 */
	private async forkExists(username: string): Promise<boolean> {
		try {
			await executeGhCommand(['api', `repos/${username}/iloom-cli`])
			return true
		} catch (error) {
			// 404 means no fork exists
			if (error instanceof Error && error.message.includes('Not Found')) {
				return false
			}
			// Re-throw unexpected errors
			throw error
		}
	}

	/**
	 * Create a fork of iloom-cli without cloning
	 */
	private async createFork(): Promise<void> {
		await executeGhCommand(['repo', 'fork', ILOOM_REPO, '--clone=false'])
	}


	/**
	 * Clone the repository using simplified gh CLI approach
	 */
	private async cloneRepository(
		username: string,
		directory: string
	): Promise<void> {
		const repoIdentifier = `${username}/iloom-cli`
		// Always use gh repo clone - it handles SSH/HTTPS based on user's git config
		await executeGhCommand(['repo', 'clone', repoIdentifier, directory])
	}

	/**
	 * Add upstream remote if it doesn't already exist
	 */
	private async addUpstreamRemote(directory: string): Promise<void> {
		try {
			// Check if upstream remote exists
			await executeGitCommand(['remote', 'get-url', 'upstream'], { cwd: directory })
			logger.info('Upstream remote already configured')
		} catch {
			// Upstream doesn't exist, add it
			logger.info('Adding upstream remote...')
			await executeGitCommand(
				['remote', 'add', 'upstream', UPSTREAM_URL],
				{ cwd: directory }
			)
			logger.success('Upstream remote configured')
		}
	}

	/**
	 * Prompt for directory with validation and retry loop
	 * @returns The validated directory path, or null if user cancels
	 */
	private async promptForDirectory(): Promise<string | null> {
		const maxRetries = 3
		let attempts = 0

		while (attempts < maxRetries) {
			const directory = await promptInput(
				'Where should the repository be cloned?',
				'./iloom-cli'
			)

			// Handle empty input (user cancelled by entering empty string after exhausting default)
			if (!directory || directory.trim() === '') {
				return null
			}

			const trimmed = directory.trim()

			// Validate the directory path
			const validation = validateDirectoryPath(trimmed)
			if (validation.isValid) {
				return trimmed
			}

			// Show error and increment attempts
			attempts++
			if (attempts < maxRetries) {
				logger.error(`${validation.error}`)
				logger.info(`Please try again (${maxRetries - attempts} attempts remaining)`)
			} else {
				logger.error(`${validation.error}`)
				logger.error('Maximum retry attempts reached')
				throw new Error(`Invalid directory after ${maxRetries} attempts: ${validation.error}`)
			}
		}

		return null
	}


	/**
	 * Configure .iloom/settings.json with upstream remote
	 */
	private async configureSettings(directory: string): Promise<void> {
		const iloomDir = path.join(directory, '.iloom')
		const settingsPath = path.join(iloomDir, 'settings.local.json')

		// Create .iloom directory
		await mkdir(iloomDir, { recursive: true })

		// Create settings.json with upstream remote configuration and github-pr mode
		const settings = {
			issueManagement: {
				github: {
					remote: 'upstream',
				},
			},
			mergeBehavior: {
				mode: 'github-draft-pr',
			},
		}

		await writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n')
	}
}
