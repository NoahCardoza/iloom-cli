import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import { parse, modify, applyEdits, ParseError } from 'jsonc-parser'
import { fileURLToPath } from 'url'
import { accessSync } from 'fs'
import { logger } from '../utils/logger.js'

/**
 * Hook configuration for a single event
 */
interface HookEntry {
	type: 'command'
	command: string
	timeout?: number
}

/**
 * Hook event configuration
 */
interface HookEventConfig {
	matcher?: string
	hooks: HookEntry[]
}

/**
 * Claude settings.json structure (partial)
 */
interface ClaudeSettings {
	hooks?: Record<string, HookEventConfig[]>
	[key: string]: unknown
}

/**
 * Manages installation of Claude Code hooks to ~/.claude/
 *
 * Hooks enable real-time monitoring of Claude session state
 * via Unix socket communication with the iloom-vscode extension.
 */
export class ClaudeHookManager {
	private claudeDir: string
	private hooksDir: string
	private settingsPath: string
	private templateDir: string

	constructor() {
		// Initialize paths using os.homedir()
		this.claudeDir = path.join(os.homedir(), '.claude')
		this.hooksDir = path.join(this.claudeDir, 'hooks')
		this.settingsPath = path.join(this.claudeDir, 'settings.json')

		// Find templates relative to the package installation
		// Same pattern as PromptTemplateManager
		const currentFileUrl = import.meta.url
		const currentFilePath = fileURLToPath(currentFileUrl)
		const distDir = path.dirname(currentFilePath)

		// Walk up to find the hooks template directory
		let templateDir = path.join(distDir, 'hooks')
		let currentDir = distDir

		while (currentDir !== path.dirname(currentDir)) {
			const candidatePath = path.join(currentDir, 'hooks')
			try {
				accessSync(candidatePath)
				templateDir = candidatePath
				break
			} catch {
				currentDir = path.dirname(currentDir)
			}
		}

		this.templateDir = templateDir
		logger.debug('ClaudeHookManager initialized', {
			claudeDir: this.claudeDir,
			hooksDir: this.hooksDir,
			settingsPath: this.settingsPath,
			templateDir: this.templateDir
		})
	}

	/**
	 * Install Claude hooks for VSCode integration
	 *
	 * This is idempotent - safe to call on every spin.
	 * Installs hook script to ~/.claude/hooks/ and merges
	 * hook configuration into ~/.claude/settings.json
	 */
	async installHooks(): Promise<void> {
		try {
			// 1. Create ~/.claude/hooks if missing
			await fs.ensureDir(this.hooksDir)

			// 2. Install hook script from bundled templates
			await this.installHookScript()

			// 3. Merge hook config into settings.json
			await this.mergeHookConfig()

			logger.debug('Claude hooks installed successfully')
		} catch (error) {
			// Log warning but don't fail - hooks are optional enhancement
			logger.warn(
				`Failed to install Claude hooks: ${error instanceof Error ? error.message : 'Unknown error'}`
			)
		}
	}

	/**
	 * Check if hooks are already installed
	 */
	async isHooksInstalled(): Promise<boolean> {
		try {
			// Check if hook script exists
			const hookScriptPath = path.join(this.hooksDir, 'iloom-hook.js')
			if (!(await fs.pathExists(hookScriptPath))) {
				return false
			}

			// Check if settings.json has our hooks
			if (!(await fs.pathExists(this.settingsPath))) {
				return false
			}

			const content = await fs.readFile(this.settingsPath, 'utf8')
			const errors: ParseError[] = []
			const settings = parse(content, errors, { allowTrailingComma: true }) as ClaudeSettings

			if (errors.length > 0 || !settings?.hooks) {
				return false
			}

			// Check if our hooks are registered (check for SessionStart as indicator)
			return Array.isArray(settings.hooks.SessionStart)
		} catch {
			return false
		}
	}

	/**
	 * Install the hook script from bundled templates
	 * Skips write if destination already has identical content
	 */
	private async installHookScript(): Promise<void> {
		const sourcePath = path.join(this.templateDir, 'iloom-hook.js')
		const destPath = path.join(this.hooksDir, 'iloom-hook.js')

		// Check if source template exists
		if (!(await fs.pathExists(sourcePath))) {
			throw new Error(`Hook template not found at ${sourcePath}`)
		}

		// Skip if destination exists and content matches
		if (await fs.pathExists(destPath)) {
			const [sourceContent, destContent] = await Promise.all([
				fs.readFile(sourcePath, 'utf8'),
				fs.readFile(destPath, 'utf8')
			])
			if (sourceContent === destContent) {
				logger.debug('Hook script already up to date, skipping')
				return
			}
		}

		// Copy hook script (only when content differs or doesn't exist)
		await fs.copyFile(sourcePath, destPath)
		logger.debug('Hook script installed', { sourcePath, destPath })
	}

	/**
	 * Merge hook configuration into settings.json
	 * Preserves existing user hooks and comments
	 */
	private async mergeHookConfig(): Promise<void> {
		// Ensure ~/.claude directory exists
		await fs.ensureDir(this.claudeDir)

		// Read existing settings (or create empty)
		let existingContent = '{}'
		let existingSettings: ClaudeSettings = {}

		if (await fs.pathExists(this.settingsPath)) {
			existingContent = await fs.readFile(this.settingsPath, 'utf8')
			const errors: ParseError[] = []
			existingSettings = parse(existingContent, errors, { allowTrailingComma: true }) as ClaudeSettings

			if (errors.length > 0) {
				logger.warn('Existing settings.json has parse errors, will attempt to merge anyway')
			}
		}

		// Get our hook configuration
		const ourHooks = this.getHookConfig()

		// Merge hooks - preserve user's existing hooks on same events
		const mergedHooks: Record<string, HookEventConfig[]> = { ...(existingSettings.hooks ?? {}) }
		let hooksAdded = false

		for (const [eventName, eventConfigs] of Object.entries(ourHooks)) {
			const existing = mergedHooks[eventName] ?? []

			// Check if our hook is already registered
			const ourConfig = eventConfigs[0]
			const ourCommand = ourConfig?.hooks?.[0]?.command
			const existingConfigIndex = existing.findIndex(
				(config) => config.hooks?.some((h) => h.command === ourCommand)
			)

			if (existingConfigIndex === -1) {
				// Add our hook config to the event
				mergedHooks[eventName] = [...existing, ...eventConfigs]
				hooksAdded = true
			} else {
				// Hook is already registered - check if we need to update the matcher
				const existingConfig = existing[existingConfigIndex]
				const ourMatcher = ourConfig?.matcher

				// Update matcher if our config has one and existing doesn't match
				if (existingConfig && ourMatcher !== undefined && existingConfig.matcher !== ourMatcher) {
					existing[existingConfigIndex] = {
						...existingConfig,
						matcher: ourMatcher
					}
					hooksAdded = true
				}
			}
		}

		// Skip write if no new hooks were added
		if (!hooksAdded) {
			logger.debug('All hooks already registered, skipping settings.json update')
			return
		}

		// Write updated settings
		let content: string

		// Check if existing content has comments
		if (existingContent.includes('//') || existingContent.includes('/*')) {
			// Use jsonc-parser to preserve comments
			let modifiedContent = existingContent
			const edits = modify(modifiedContent, ['hooks'], mergedHooks, {})
			content = applyEdits(modifiedContent, edits)
		} else {
			// No comments - use JSON.stringify
			const updatedSettings: ClaudeSettings = {
				...existingSettings,
				hooks: mergedHooks
			}
			content = JSON.stringify(updatedSettings, null, 2) + '\n'
		}

		// Write atomically using temp file + rename
		const tempPath = `${this.settingsPath}.tmp`
		await fs.writeFile(tempPath, content, 'utf8')
		await fs.rename(tempPath, this.settingsPath)

		logger.debug('Hook configuration merged into settings.json')
	}

	/**
	 * Get the hook configuration to register
	 *
	 * Each event maps to a hook that runs iloom-hook.js
	 */
	private getHookConfig(): Record<string, HookEventConfig[]> {
		const hookCommand = `node ${path.join(this.hooksDir, 'iloom-hook.js')}`

		return {
			Notification: [
				{ hooks: [{ type: 'command', command: hookCommand }] }
			],
			Stop: [
				{ hooks: [{ type: 'command', command: hookCommand }] }
			],
			SubagentStop: [
				{ hooks: [{ type: 'command', command: hookCommand }] }
			],
			PermissionRequest: [
				{ matcher: '*', hooks: [{ type: 'command', command: hookCommand, timeout: 86400 }] }
			],
			PreToolUse: [
				{ matcher: '*', hooks: [{ type: 'command', command: hookCommand }] }
			],
			PostToolUse: [
				{ matcher: '*', hooks: [{ type: 'command', command: hookCommand }] }
			],
			SessionStart: [
				{ matcher: '*', hooks: [{ type: 'command', command: hookCommand }] }
			],
			SessionEnd: [
				{ hooks: [{ type: 'command', command: hookCommand }] }
			],
			UserPromptSubmit: [
				{ hooks: [{ type: 'command', command: hookCommand }] }
			]
		}
	}
}
