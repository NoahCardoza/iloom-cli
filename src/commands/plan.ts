import { logger } from '../utils/logger.js'
import chalk from 'chalk'
import { detectClaudeCli, launchClaude } from '../utils/claude.js'
import { PromptTemplateManager } from '../lib/PromptTemplateManager.js'
import { generateIssueManagementMcpConfig } from '../utils/mcp.js'
import { SettingsManager } from '../lib/SettingsManager.js'
import { IssueTrackerFactory } from '../lib/IssueTrackerFactory.js'
import { matchIssueIdentifier } from '../utils/IdentifierParser.js'
import { IssueManagementProviderFactory } from '../mcp/IssueManagementProviderFactory.js'
import type { IssueProvider, ChildIssueResult, DependenciesResult } from '../mcp/types.js'

/**
 * Format child issues as a markdown list for inclusion in the prompt
 */
function formatChildIssues(children: ChildIssueResult[], issuePrefix: string): string {
	if (children.length === 0) return 'None'
	return children
		.map(child => `- ${issuePrefix}${child.id}: ${child.title} (${child.state})`)
		.join('\n')
}

/**
 * Format dependencies as a markdown list for inclusion in the prompt
 */
function formatDependencies(dependencies: DependenciesResult, issuePrefix: string): string {
	const lines: string[] = []

	if (dependencies.blockedBy.length > 0) {
		lines.push('**Blocked by:**')
		for (const dep of dependencies.blockedBy) {
			lines.push(`- ${issuePrefix}${dep.id}: ${dep.title} (${dep.state})`)
		}
	}

	if (dependencies.blocking.length > 0) {
		if (lines.length > 0) lines.push('')
		lines.push('**Blocking:**')
		for (const dep of dependencies.blocking) {
			lines.push(`- ${issuePrefix}${dep.id}: ${dep.title} (${dep.state})`)
		}
	}

	return lines.length > 0 ? lines.join('\n') : 'None'
}

/**
 * Launch interactive planning session with Architect persona
 * Implements the `il plan` command requested in issue #471
 *
 * The Architect persona helps users:
 * - Break epics down into child issues following "1 issue = 1 loom = 1 PR" pattern
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
	 * @param yolo - Optional flag to enable autonomous mode (skip permission prompts)
	 */
	public async execute(prompt?: string, model?: string, yolo?: boolean): Promise<void> {
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

		// Detect if prompt is an issue number for decomposition mode
		// Uses shared matchIssueIdentifier() utility to identify issue identifiers:
		// - Numeric pattern: #123 or 123 (GitHub format)
		// - Linear pattern: ENG-123 (requires at least 2 letters before dash)
		const identifierMatch = prompt ? matchIssueIdentifier(prompt) : { isIssueIdentifier: false }
		const looksLikeIssueIdentifier = identifierMatch.isIssueIdentifier
		let decompositionContext: {
			identifier: string
			title: string
			body: string
			children?: ChildIssueResult[]
			dependencies?: DependenciesResult
		} | null = null

		const provider = settings ? IssueTrackerFactory.getProviderName(settings) : 'github'
		const issuePrefix = provider === 'github' ? '#' : ''

		if (prompt && looksLikeIssueIdentifier) {
			// Validate and fetch issue using issueTracker.detectInputType() pattern from StartCommand
			const issueTracker = IssueTrackerFactory.create(settings)

			logger.debug('Detected potential issue identifier, validating via issueTracker', { identifier: prompt })

			// Use detectInputType to validate the identifier exists (same pattern as StartCommand)
			const detection = await issueTracker.detectInputType(prompt)

			if (detection.type === 'issue' && detection.identifier) {
				// Valid issue found - fetch full details for decomposition context
				const issue = await issueTracker.fetchIssue(detection.identifier)
				decompositionContext = {
					identifier: String(issue.number),
					title: issue.title,
					body: issue.body
				}
				logger.info(chalk.dim(`Preparing to create a detailed plan for issue #${decompositionContext.identifier}: ${decompositionContext.title}`))

				// Fetch existing children and dependencies using MCP provider
				// This allows users to resume planning where they left off
				try {
					const mcpProvider = IssueManagementProviderFactory.create(provider as IssueProvider)

					// Fetch child issues
					logger.debug('Fetching child issues for decomposition context', { identifier: decompositionContext.identifier })
					const children = await mcpProvider.getChildIssues({ number: decompositionContext.identifier })
					if (children.length > 0) {
						decompositionContext.children = children
						logger.debug('Found existing child issues', { count: children.length })
					}

					// Fetch dependencies (both directions)
					logger.debug('Fetching dependencies for decomposition context', { identifier: decompositionContext.identifier })
					const dependencies = await mcpProvider.getDependencies({
						number: decompositionContext.identifier,
						direction: 'both'
					})
					if (dependencies.blocking.length > 0 || dependencies.blockedBy.length > 0) {
						decompositionContext.dependencies = dependencies
						logger.debug('Found existing dependencies', {
							blocking: dependencies.blocking.length,
							blockedBy: dependencies.blockedBy.length
						})
					}
				} catch (error) {
					// Log but don't fail - children/dependencies are optional context
					logger.debug('Failed to fetch children/dependencies, continuing without them', {
						error: error instanceof Error ? error.message : 'Unknown error'
					})
				}
			} else {
				// Input matched issue pattern but issue not found - treat as regular prompt
				logger.debug('Input matched issue pattern but issue not found, treating as planning topic', {
					identifier: prompt,
					detectionType: detection.type
				})
			}
		}

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

		// Load plan prompt template with mode-specific variables
		logger.debug('Loading plan prompt template')
		const isVscodeMode = process.env.ILOOM_VSCODE === '1'
		logger.debug('VS Code mode detection', { isVscodeMode })
		const templateVariables = {
			IS_VSCODE_MODE: isVscodeMode,
			EXISTING_ISSUE_MODE: !!decompositionContext,
			FRESH_PLANNING_MODE: !decompositionContext,
			PARENT_ISSUE_NUMBER: decompositionContext?.identifier,
			PARENT_ISSUE_TITLE: decompositionContext?.title,
			PARENT_ISSUE_BODY: decompositionContext?.body,
			PARENT_ISSUE_CHILDREN: decompositionContext?.children
				? formatChildIssues(decompositionContext.children, issuePrefix)
				: undefined,
			PARENT_ISSUE_DEPENDENCIES: decompositionContext?.dependencies
				? formatDependencies(decompositionContext.dependencies, issuePrefix)
				: undefined,
		}
		const architectPrompt = await this.templateManager.getPrompt('plan', templateVariables)
		logger.debug('Plan prompt loaded', {
			promptLength: architectPrompt.length,
			mode: decompositionContext ? 'decomposition' : 'fresh',
		})

		// Define allowed tools for the Architect persona
		const allowedTools = [
			// Issue management tools
			'mcp__issue_management__create_issue',
			'mcp__issue_management__create_child_issue',
			'mcp__issue_management__get_issue',
			'mcp__issue_management__get_child_issues',
			'mcp__issue_management__get_comment',
			'mcp__issue_management__create_comment',
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

		// Handle --yolo mode
		if (yolo) {
			if (!prompt) {
				throw new Error('--yolo requires a prompt or issue identifier (e.g., il plan --yolo "add gitlab support" or il plan --yolo 42)')
			}
			logger.warn(
				'⚠️  YOLO mode enabled - Claude will skip permission prompts and proceed autonomously'
			)
		}

		logger.debug('Launching Claude with options', {
			optionKeys: Object.keys(claudeOptions),
			headless: claudeOptions.headless,
			hasSystemPrompt: !!claudeOptions.appendSystemPrompt,
			addDir: claudeOptions.addDir,
			yolo,
		})

		// Launch Claude in interactive mode
		// Construct initial message based on mode
		let initialMessage: string
		if (decompositionContext) {
			// Issue decomposition mode - provide context about what to decompose
			initialMessage = `Break down issue #${decompositionContext.identifier} into child issues.`
		} else if (prompt) {
			// Fresh planning with user-provided topic
			initialMessage = prompt
		} else {
			// Interactive mode - no topic provided
			initialMessage = 'Help me plan a feature or decompose work into issues.'
		}

		// Apply yolo mode wrapper if enabled
		if (yolo) {
			initialMessage = `[AUTONOMOUS MODE]
Proceed through the flow without requiring user interaction. Make and document your assumptions and proceed to create the epic and child issues and dependencies if necessary. This guidance supersedes all previous guidance.

[TOPIC]
${initialMessage}`
		}

		await launchClaude(initialMessage, {
			...claudeOptions,
			...(yolo && { permissionMode: 'bypassPermissions' as const }),
		})

		logger.debug('Claude session completed')
		logger.info(chalk.green('Planning session ended.'))
	}
}
