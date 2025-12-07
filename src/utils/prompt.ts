import * as readline from 'node:readline'
import { logger } from './logger.js'

/**
 * Prompt user for confirmation (yes/no)
 * @param message The question to ask the user
 * @param defaultValue Default value if user just presses enter (default: false)
 * @returns Promise<boolean> - true if user confirms, false otherwise
 */
export async function promptConfirmation(
	message: string,
	defaultValue = false
): Promise<boolean> {
	const suffix = defaultValue ? '[Y/n]' : '[y/N]'
	const fullMessage = `${message} ${suffix}: `

	// Loop until valid input is received
	while (true) {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		})

		const answer = await new Promise<string>((resolve) => {
			rl.question(fullMessage, (ans) => {
				rl.close()
				resolve(ans)
			})
		})

		const normalized = answer.trim().toLowerCase()

		if (normalized === '') {
			return defaultValue
		}

		if (normalized === 'y' || normalized === 'yes') {
			return true
		}

		if (normalized === 'n' || normalized === 'no') {
			return false
		}

		// Invalid input - show warning and re-prompt
		logger.warn('Invalid input. Please enter y/yes or n/no.')
	}
}

/**
 * Prompt user for text input
 * @param message The prompt message
 * @param defaultValue Optional default value
 * @returns Promise<string> - the user's input
 */
export async function promptInput(
	message: string,
	defaultValue?: string
): Promise<string> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	})

	const suffix = defaultValue ? ` [${defaultValue}]` : ''
	const fullMessage = `${message}${suffix}: `

	return new Promise((resolve) => {
		rl.question(fullMessage, (answer) => {
			rl.close()

			const trimmed = answer.trim()

			if (trimmed === '' && defaultValue !== undefined) {
				resolve(defaultValue)
				return
			}

			resolve(trimmed)
		})
	})
}

/**
 * Wait for the user to press any key
 * @param message Optional message to display (default: "Press any key to continue...")
 * @returns Promise<string> - resolves with the key that was pressed
 */
export async function waitForKeypress(
	message = 'Press any key to continue...'
): Promise<string> {
	// Display message first
	process.stdout.write(message)

	return new Promise((resolve) => {
		// Enable raw mode to capture single keypresses
		process.stdin.setRawMode(true)
		process.stdin.resume()

		// Listen for single data event
		process.stdin.once('data', (chunk: Buffer) => {
			const key = chunk.toString('utf8')

			// Restore normal mode first (cleanup before any exit)
			process.stdin.setRawMode(false)
			process.stdin.pause()

			// Handle Ctrl+C (ETX character \x03)
			if (key === '\x03') {
				process.stdout.write('\n')
				process.exit(130) // Standard exit code for SIGINT (128 + 2)
			}

			// Add newline after keypress for clean output
			process.stdout.write('\n')
			resolve(key)
		})
	})
}

/**
 * Check if running in an interactive environment
 * Returns false if CI environment or no TTY
 */
export function isInteractiveEnvironment(): boolean {
	return process.stdin.isTTY === true && process.env.CI !== 'true'
}

// Commit action type for type safety
export type CommitAction = 'accept' | 'edit' | 'abort'

/**
 * Display commit message and prompt for action
 * @param message The commit message to display
 * @returns Promise<CommitAction> - 'accept', 'edit', or 'abort'
 */
export async function promptCommitAction(message: string): Promise<CommitAction> {
	// Check for non-interactive environment first
	if (!isInteractiveEnvironment()) {
		return 'accept'
	}

	// Display the commit message with clear demarcation
	process.stdout.write('\n' + '='.repeat(60) + '\n')
	process.stdout.write('COMMIT MESSAGE:\n')
	process.stdout.write('='.repeat(60) + '\n')
	process.stdout.write(message + '\n')
	process.stdout.write('='.repeat(60) + '\n\n')

	// Loop until valid input is received
	while (true) {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		})

		const answer = await new Promise<string>((resolve) => {
			rl.question('[A]ccept as-is, [E]dit in editor, A[b]ort? [A/e/b]: ', (ans) => {
				rl.close()
				resolve(ans)
			})
		})

		const normalized = answer.trim().toLowerCase()

		if (normalized === '' || normalized === 'a' || normalized === 'accept') {
			return 'accept'
		}

		if (normalized === 'e' || normalized === 'edit') {
			return 'edit'
		}

		if (normalized === 'b' || normalized === 'abort') {
			return 'abort'
		}

		// Invalid input - show warning and re-prompt
		logger.warn('Invalid input. Please enter A (accept), E (edit), or B (abort).')
	}
}
