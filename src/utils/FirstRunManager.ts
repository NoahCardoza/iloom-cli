import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import { logger } from './logger.js'

/**
 * FirstRunManager: Detect and track first-time spin usage via marker file
 *
 * Follows the same pattern as UpdateNotifier for file-based state tracking
 * in ~/.config/iloom-ai/ directory.
 */
export class FirstRunManager {
	private markerFilePath: string

	constructor(feature: string = 'spin') {
		const configDir = path.join(os.homedir(), '.config', 'iloom-ai')
		this.markerFilePath = path.join(configDir, `${feature}-first-run`)
		logger.debug('FirstRunManager initialized', {
			feature,
			markerFilePath: this.markerFilePath
		})
	}

	/**
	 * Check if this is the first run of the feature
	 * Returns true if marker file doesn't exist
	 * Handles errors gracefully by returning true (treat as first-run on error)
	 */
	async isFirstRun(): Promise<boolean> {
		logger.debug('isFirstRun: Checking for marker file', { markerFilePath: this.markerFilePath })
		try {
			const exists = await fs.pathExists(this.markerFilePath)
			logger.debug(`isFirstRun: Marker file exists=${exists}`)
			return !exists
		} catch (error) {
			// On error, gracefully degrade by treating as first-run
			logger.debug(`isFirstRun: Error checking marker file, treating as first-run: ${error}`)
			return true
		}
	}

	/**
	 * Mark the feature as having been run
	 * Creates the marker file in config directory
	 * Handles errors gracefully without throwing
	 */
	async markAsRun(): Promise<void> {
		logger.debug('markAsRun: Attempting to create marker file', { markerFilePath: this.markerFilePath })
		try {
			// Ensure directory exists
			const configDir = path.dirname(this.markerFilePath)
			logger.debug(`markAsRun: Ensuring config directory exists: ${configDir}`)
			await fs.ensureDir(configDir)

			// Write marker file with timestamp for debugging
			const markerContent = {
				firstRun: new Date().toISOString(),
			}
			await fs.writeFile(this.markerFilePath, JSON.stringify(markerContent, null, 2), 'utf8')
			logger.debug('markAsRun: Marker file created successfully')
		} catch (error) {
			// Don't throw on errors - just log debug message
			// Failing to write marker shouldn't break the workflow
			logger.debug(`markAsRun: Failed to create marker file: ${error}`)
		}
	}
}
