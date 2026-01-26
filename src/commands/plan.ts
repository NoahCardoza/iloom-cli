import { logger } from '../utils/logger.js'
import chalk from 'chalk'
import { detectClaudeCli, launchClaude } from '../utils/claude.js'
import { PromptTemplateManager } from '../lib/PromptTemplateManager.js'
import { generateIssueManagementMcpConfig } from '../utils/mcp.js'
import { SettingsManager } from '../lib/SettingsManager.js'
import { IssueTrackerFactory } from '../lib/IssueTrackerFactory.js'

/**
 * Launch interactive planning session with Architect persona
 * Implements the `il plan` command requested in issue #471
 *
 * The Architect persona helps users:
 * - Decompose features into child issues following "1 issue = 1 loom = 1 PR" pattern
 * - Think through implementation approaches
 * - Create issues at the end of the planning session using MCP tools
 */
export class PlanCommand {
	private readonly templateManager: PromptTemplateManager

	constructor(templateManager?: PromptTemplateManager) {
		this.templateManager = templateManager ?? new PromptTemplateManager()
	}

	/**
	 * Main entry point for the plan command
	 * @param prompt - Optional initial planning prompt or topic
	 * @param model - Optional model to use (defaults to 'opus')
	 */
	public async execute(prompt?: string, model?: string): Promise<void> {
		try {
			logger.debug('PlanCommand.execute() starting', {
				cwd: process.cwd(),
				hasPrompt: !!prompt,
			})

			logger.info(chalk.bold('Starting interactive planning session...'))

			// Check if Claude CLI is available
			logger.debug('Checking Claude CLI availability')
			const claudeAvailable = await detectClaudeCli()
			logger.debug('Claude CLI availability check result', { claudeAvailable })

			if (!claudeAvailable) {
				logger.error(
					"Claude Code not detected. Please install it: npm install -g @anthropic-ai/claude-code"
				)
				throw new Error('Claude Code CLI is required for planning sessions')
			}

			// Load settings to detect configured issue provider and model
			const settingsManager = new SettingsManager()
			const settings = await settingsManager.loadSettings()
			const provider = settings ? IssueTrackerFactory.getProviderName(settings) : 'github'
			// Use CLI model if provided, otherwise use settings (plan.model), defaults to opus
			const effectiveModel = model ?? settingsManager.getPlanModel(settings ?? undefined)
			logger.debug('Detected issue provider and model', { provider, effectiveModel })

			// Generate MCP config for issue management tools
			// This will throw if no git remote is configured (per requirements: fail with error, no fallback)
			logger.debug('Generating MCP config for issue management')
			let mcpConfig: Record<string, unknown>[]
			try {
				mcpConfig = await generateIssueManagementMcpConfig(undefined, undefined, provider, settings ?? undefined)
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Unknown error'
				logger.error(`Failed to generate MCP config: ${message}`)
				logger.error(
					'Planning sessions require a git repository with a remote configured.'
				)
				throw new Error(
					`Cannot start planning session: ${message}. Ensure you are in a git repository with a remote configured.`
				)
			}

			logger.debug('MCP config generated', {
				serverCount: mcpConfig.length,
			})

			// Load plan prompt template
			logger.debug('Loading plan prompt template')
			const architectPrompt = await this.templateManager.loadTemplate('plan')
			logger.debug('Plan prompt loaded', {
				promptLength: architectPrompt.length,
			})

			// Define allowed tools for the Architect persona
			const allowedTools = [
				// Issue management tools
				'mcp__issue_management__create_issue',
				'mcp__issue_management__create_child_issue',
				'mcp__issue_management__get_issue',
				'mcp__issue_management__get_comment',
				// Dependency management tools
				'mcp__issue_management__create_dependency',
				'mcp__issue_management__get_dependencies',
				'mcp__issue_management__remove_dependency',
				// Codebase exploration tools (read-only)
				'Read',
				'Glob',
				'Grep',
				'Task',
				// Web research tools
				'WebFetch',
				'WebSearch',
				// Git commands for understanding repo state
				'Bash(git status:*)',
				'Bash(git log:*)',
				'Bash(git branch:*)',
				'Bash(git remote:*)',
				'Bash(git diff:*)',
				'Bash(git show:*)',
			]

			// Build Claude options
			const claudeOptions = {
				model: effectiveModel,
				headless: false,
				appendSystemPrompt: architectPrompt,
				mcpConfig,
				addDir: process.cwd(),
				allowedTools,
			}

			logger.debug('Launching Claude with options', {
				optionKeys: Object.keys(claudeOptions),
				headless: claudeOptions.headless,
				hasSystemPrompt: !!claudeOptions.appendSystemPrompt,
				addDir: claudeOptions.addDir,
			})

			// Launch Claude in interactive mode
			const initialMessage =
				prompt ?? 'Help me plan a feature or decompose work into issues.'
			await launchClaude(initialMessage, claudeOptions)

			logger.debug('Claude session completed')
			logger.info(chalk.green('Planning session ended.'))
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error'
			logger.error(`Planning session failed: ${message}`)
			throw error
		}
	}
}
