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
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	})

	const suffix = defaultValue ? '[Y/n]' : '[y/N]'
	const fullMessage = `${message} ${suffix}: `

	return new Promise((resolve) => {
		rl.question(fullMessage, (answer) => {
			rl.close()

			const normalized = answer.trim().toLowerCase()

			if (normalized === '') {
				resolve(defaultValue)
				return
			}

			if (normalized === 'y' || normalized === 'yes') {
				resolve(true)
				return
			}

			if (normalized === 'n' || normalized === 'no') {
				resolve(false)
				return
			}

			// Invalid input, use default
			logger.warn('Invalid input, using default value', {
				input: answer,
				defaultValue,
			})
			resolve(defaultValue)
		})
	})
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
			// Restore normal mode
			process.stdin.setRawMode(false)
			process.stdin.pause()

			// Add newline after keypress for clean output
			process.stdout.write('\n')

			// Convert buffer to string and return the key
			const key = chunk.toString('utf8')
			resolve(key)
		})
	})
}
