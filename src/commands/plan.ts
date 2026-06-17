/* global AbortController, setImmediate */
import { logger, createStderrLogger } from '../utils/logger.js'
import { withLogger } from '../utils/logger-context.js'
import chalk from 'chalk'
import { preAcceptClaudeTrust } from '../utils/claude-trust.js'
import { PromptTemplateManager, type TemplateVariables } from '../lib/PromptTemplateManager.js'
import { AgentManager } from '../lib/AgentManager.js'
import { generateIssueManagementMcpConfig, generateHarnessMcpConfig } from '../utils/mcp.js'
import { HarnessServer } from '../lib/HarnessServer.js'
import { SettingsManager, PlanCommandSettingsSchema } from '../lib/SettingsManager.js'
import type { EffortLevel } from '../types/index.js'
import { IssueTrackerFactory } from '../lib/IssueTrackerFactory.js'
import { matchIssueIdentifier } from '../utils/IdentifierParser.js'
import { IssueManagementProviderFactory } from '../mcp/IssueManagementProviderFactory.js'
import { needsFirstRunSetup, launchFirstRunSetup } from '../utils/first-run-setup.js'
import type { IssueProvider, ChildIssueResult, DependenciesResult } from '../mcp/types.js'
import { promptConfirmation, isInteractiveEnvironment } from '../utils/prompt.js'
import { TelemetryService } from '../lib/TelemetryService.js'
import { processMarkdownImages } from '../utils/image-processor.js'
import { StartCommand } from './start.js'
import { IgniteCommand } from './ignite.js'
import { createPlanningRuntime, type PlanPrintOptions } from './plan-runtime.js'

const PLANNER_PROVIDERS = ['claude', 'gemini', 'codex'] as const
const REVIEWER_PROVIDERS = ['claude', 'gemini', 'codex', 'none'] as const

type PlannerProvider = (typeof PLANNER_PROVIDERS)[number]
type ReviewerProvider = (typeof REVIEWER_PROVIDERS)[number]

function formatChildIssues(children: ChildIssueResult[], issuePrefix: string): string {
	if (children.length === 0) return 'None'
	return children
		.map(child => `- ${issuePrefix}${child.id}: ${child.title} (${child.state})`)
		.join('\n')
}

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

export class PlanCommand {
	private readonly templateManager: PromptTemplateManager
	private readonly agentManager: AgentManager

	constructor(templateManager?: PromptTemplateManager, agentManager?: AgentManager) {
		this.templateManager = templateManager ?? new PromptTemplateManager()
		this.agentManager = agentManager ?? new AgentManager()
	}

	public async execute(
		prompt?: string,
		model?: string,
		flags?: {
			oneShot?: 'default' | 'noReview' | 'bypassPermissions'
			dangerouslySkipPermissions?: boolean
			autoSwarm?: boolean
		},
		planner?: string,
		reviewer?: string,
		printOptions?: PlanPrintOptions,
		effort?: EffortLevel
	): Promise<void> {
		const isJsonMode = (printOptions?.json ?? false) || (printOptions?.jsonStream ?? false)
		if (isJsonMode) {
			const jsonLogger = createStderrLogger()
			return withLogger(jsonLogger, () => this.executeInternal(prompt, model, flags, planner, reviewer, printOptions, effort))
		}

		return this.executeInternal(prompt, model, flags, planner, reviewer, printOptions, effort)
	}

	private async executeInternal(
		prompt?: string,
		model?: string,
		flags?: {
			oneShot?: 'default' | 'noReview' | 'bypassPermissions'
			dangerouslySkipPermissions?: boolean
			autoSwarm?: boolean
		},
		planner?: string,
		reviewer?: string,
		printOptions?: PlanPrintOptions,
		effort?: EffortLevel
	): Promise<void> {
		let normalizedPlanner: PlannerProvider | undefined
		if (planner) {
			const normalized = planner.toLowerCase()
			const result = PlanCommandSettingsSchema.shape.planner.safeParse(normalized)
			if (!result.success) {
				throw new Error(`Invalid planner: "${planner}". Allowed values: ${PLANNER_PROVIDERS.join(', ')}`)
			}
			normalizedPlanner = normalized as PlannerProvider
		}

		let normalizedReviewer: ReviewerProvider | undefined
		if (reviewer) {
			const normalized = reviewer.toLowerCase()
			const result = PlanCommandSettingsSchema.shape.reviewer.safeParse(normalized)
			if (!result.success) {
				throw new Error(`Invalid reviewer: "${reviewer}". Allowed values: ${REVIEWER_PROVIDERS.join(', ')}`)
			}
			normalizedReviewer = normalized as ReviewerProvider
		}

		const resolvedFlags = flags ?? {}
		const autoSwarm = resolvedFlags.autoSwarm ?? false

		logger.debug('PlanCommand.execute() starting', {
			cwd: process.cwd(),
			hasPrompt: !!prompt,
			flags: resolvedFlags,
			planner: normalizedPlanner ?? planner,
			reviewer: normalizedReviewer ?? reviewer,
		})

		if (process.env.FORCE_FIRST_TIME_SETUP === 'true' || await needsFirstRunSetup()) {
			await launchFirstRunSetup()
		}

		logger.info(chalk.bold('Starting interactive planning session...'))

		const settingsManager = new SettingsManager()
		const settings = await settingsManager.loadSettings()
		const settingsModel = settings?.plan?.model
		const modelProvidedByUser = model !== undefined || settingsModel !== undefined
		const effectiveModel = model ?? settingsModel ?? settingsManager.getPlanModel(settings ?? undefined)
		const effectiveEffort = effort ?? settingsManager.getPlanEffort(settings ?? undefined)
		const effectivePlanner = normalizedPlanner ?? settingsManager.getPlanPlanner(settings ?? undefined)
		const effectiveReviewer = normalizedReviewer ?? settingsManager.getPlanReviewer(settings ?? undefined)
		const planningRuntime = createPlanningRuntime(effectivePlanner)

		planningRuntime.validate({
			planner: effectivePlanner,
			reviewer: effectiveReviewer,
			modelProvidedByUser,
			...(autoSwarm !== undefined && { autoSwarm }),
			...(model !== undefined && { model }),
			...(settingsModel !== undefined && model === undefined && { model: settingsModel }),
		})
		await planningRuntime.ensureCliAvailable()

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
			const issueTracker = IssueTrackerFactory.create(settings)

			logger.debug('Detected potential issue identifier, validating via issueTracker', { identifier: prompt })

			const detection = await issueTracker.detectInputType(prompt)

			if (detection.type === 'issue' && detection.identifier) {
				if (planningRuntime.kind === 'codex') {
					throw new Error('Codex planning currently supports new planning prompts only. Use --planner claude to plan an existing issue, or provide a fresh planning prompt without an issue identifier.')
				}

				const issue = await issueTracker.fetchIssue(detection.identifier)

				// Construct the MCP provider once and reuse for body+comments and
				// children/dependencies. If construction fails, all MCP fetches are
				// skipped and the planning session falls back to issueTracker.fetchIssue's
				// body, with image-processing run on it explicitly below.
				let mcpProvider: ReturnType<typeof IssueManagementProviderFactory.create> | null = null
				try {
					mcpProvider = IssueManagementProviderFactory.create(provider as IssueProvider, settings ?? undefined)
				} catch (error) {
					if (error instanceof TypeError || error instanceof ReferenceError || error instanceof SyntaxError) {
						throw error
					}
					logger.debug(`Failed to construct MCP provider, continuing without comments/children/dependencies: ${error instanceof Error ? error.message : String(error)}`)
				}

				// The MCP provider's getIssue is the source of truth for body content:
				// it already runs processMarkdownImages AND appends provider-specific extras
				// (e.g. Linear paperclip attachments). Discarding its body would silently drop
				// attachments from the planning context.
				let bodyForPlan = issue.body
				let bodyFromMcp = false
				let commentsSection = ''
				if (mcpProvider) {
					try {
						const mcpIssue = await mcpProvider.getIssue({ number: detection.identifier, includeComments: true })
						if (mcpIssue.body) {
							bodyForPlan = mcpIssue.body
							bodyFromMcp = true
						}
						if (mcpIssue.comments && mcpIssue.comments.length > 0) {
							const commentBlocks = mcpIssue.comments.map(c => {
								const displayName = c.author?.displayName
								const login = c.author && typeof c.author.login === 'string' ? c.author.login : undefined
								const author = displayName ?? login ?? 'unknown'
								const body = c.body || ''
								return `### Comment by ${author}\n\n${body}`
							})
							commentsSection = `\n\n## Comments\n\n${commentBlocks.join('\n\n---\n\n')}`
						}
					} catch (error) {
						if (error instanceof TypeError || error instanceof ReferenceError || error instanceof SyntaxError) {
							throw error
						}
						logger.debug(`MCP getIssue failed for plan context, falling back to issueTracker body: ${error instanceof Error ? error.message : String(error)}`)
					}
				}

				// Fallback: if MCP didn't supply a body (provider construction failed or
				// getIssue threw), run image processing directly on the raw fetchIssue body
				// so authenticated image URLs are still rewritten to local paths.
				if (!bodyFromMcp) {
					try {
						bodyForPlan = await processMarkdownImages(issue.body, provider as IssueProvider)
					} catch (error) {
						if (error instanceof TypeError || error instanceof ReferenceError || error instanceof SyntaxError) {
							throw error
						}
						logger.debug(`processMarkdownImages fallback failed, using raw body: ${error instanceof Error ? error.message : String(error)}`)
						bodyForPlan = issue.body
					}
				}

				decompositionContext = {
					identifier: String(issue.number),
					title: issue.title,
					body: bodyForPlan + commentsSection,
				}
				logger.info(chalk.dim(`Preparing to create a detailed plan for issue #${decompositionContext.identifier}: ${decompositionContext.title}`))

				if (mcpProvider) {
					try {
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
							direction: 'both',
						})
						if (dependencies.blocking.length > 0 || dependencies.blockedBy.length > 0) {
							decompositionContext.dependencies = dependencies
							logger.debug('Found existing dependencies', {
								blocking: dependencies.blocking.length,
								blockedBy: dependencies.blockedBy.length,
							})
						}
					} catch (error) {
						logger.debug('Failed to fetch children/dependencies, continuing without them', {
							error: error instanceof Error ? error.message : 'Unknown error',
						})
					}
				}
			} else {
				logger.debug('Input matched issue pattern but issue not found, treating as planning topic', {
					identifier: prompt,
					detectionType: detection.type,
				})
			}
		}

		logger.debug('Detected issue provider, model, planner, and reviewer', {
			provider,
			effectiveModel,
			effectivePlanner,
			effectiveReviewer,
		})

		logger.debug('Generating MCP config for issue management')
		let mcpConfig: Record<string, unknown>[]
		try {
			mcpConfig = await generateIssueManagementMcpConfig(undefined, undefined, provider, settings ?? undefined)
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error'

			if (isInteractiveEnvironment()) {
				const shouldRunInit = await promptConfirmation(
					"No git repository or remote found. Would you like to run 'il init' to set up?",
					true
				)
				if (shouldRunInit) {
					logger.info(chalk.bold('Launching iloom init...'))
					const { InitCommand } = await import('./init.js')
					const initCommand = new InitCommand()
					await initCommand.execute(
						'Help the user set up a GitHub repository or Linear project for this project so they can use issue management features. When complete tell the user they can exit to continue the planning session.'
					)

					logger.info(chalk.bold('Retrying planning session setup...'))
					try {
						mcpConfig = await generateIssueManagementMcpConfig(undefined, undefined, provider, settings ?? undefined)
					} catch (retryError) {
						const retryMessage = retryError instanceof Error ? retryError.message : 'Unknown error'
						logger.error(`Failed to generate MCP config: ${retryMessage}`)
						if (provider === 'github') {
							logger.error('GitHub issue management requires a git repository with a GitHub remote configured.')
							throw new Error(
								`Cannot start planning session after init: ${retryMessage}. Ensure you are in a git repository with a GitHub remote configured.`
							)
						}

						logger.error('Linear issue management requires LINEAR_API_TOKEN to be configured.')
						throw new Error(
							`Cannot start planning session after init: ${retryMessage}. Ensure LINEAR_API_TOKEN is configured in settings or environment.`
						)
					}
				} else {
					logger.error(`Failed to generate MCP config: ${message}`)
					if (provider === 'github') {
						logger.error('GitHub issue management requires a git repository with a GitHub remote configured.')
						throw new Error(
							`Cannot start planning session: ${message}. Ensure you are in a git repository with a GitHub remote configured.`
						)
					}

					logger.error('Linear issue management requires LINEAR_API_TOKEN to be configured.')
					throw new Error(
						`Cannot start planning session: ${message}. Ensure LINEAR_API_TOKEN is configured in settings or environment.`
					)
				}
			} else {
				logger.error(`Failed to generate MCP config: ${message}`)
				if (provider === 'github') {
					logger.error('GitHub issue management requires a git repository with a GitHub remote configured.')
					throw new Error(
						`Cannot start planning session: ${message}. Ensure you are in a git repository with a GitHub remote configured.`
					)
				}

				logger.error('Linear issue management requires LINEAR_API_TOKEN to be configured.')
				throw new Error(
					`Cannot start planning session: ${message}. Ensure LINEAR_API_TOKEN is configured in settings or environment.`
				)
			}
		}

		logger.debug('MCP config generated', { serverCount: mcpConfig.length })

		let harness: HarnessServer | null = null
		let externalHarness = false
		let epicData: { epicIssueNumber: string; childIssues: number[] } | null = null
		const controller = autoSwarm ? new AbortController() : null
		const autoSwarmStartTime = autoSwarm ? Date.now() : null
		let autoSwarmSuccess = false
		let autoSwarmPhaseReached: 'plan' | 'start' | 'spin' = 'plan'
		let autoSwarmFallbackToNormal = false

		if (autoSwarm) {
			const autoSwarmSource = decompositionContext ? 'decomposition' : 'fresh'
			try {
				TelemetryService.getInstance().track('auto_swarm.started', {
					source: autoSwarmSource,
					planner: effectivePlanner,
				})
			} catch (error) {
				logger.debug(`Telemetry auto_swarm.started tracking failed: ${error instanceof Error ? error.message : error}`)
			}

			const externalSocket = process.env.ILOOM_HARNESS_SOCKET
			externalHarness = !!externalSocket

			if (!externalSocket) {
				harness = new HarnessServer()
				await harness.start()
			}

			const socketPath = externalSocket ?? harness?.path
			if (!socketPath) {
				throw new Error('Unexpected: no harness socket path available')
			}

			if (harness) {
				harness.registerHandler('done', (data) => {
					epicData = data as typeof epicData
					setImmediate(() => { controller?.abort() })
					return {
						type: 'instruction' as const,
						content: 'Planning complete. The auto-swarm pipeline will now create the epic workspace and launch swarm mode automatically.',
					}
				}, { idempotent: true })
			}

			const harnessMcpConfig = generateHarnessMcpConfig(socketPath)
			mcpConfig = [...mcpConfig, ...harnessMcpConfig]
		}

		const isVscodeMode = process.env.ILOOM_VSCODE === '1'
		logger.debug('VS Code mode detection', { isVscodeMode })

		const providerFlags = PLANNER_PROVIDERS.reduce((acc, p) => ({
			...acc,
			[`USE_${p.toUpperCase()}_PLANNER`]: effectivePlanner === p,
		}), {} as Record<string, boolean>)

		;(['claude', 'gemini', 'codex'] as const).forEach(p => {
			providerFlags[`USE_${p.toUpperCase()}_REVIEWER`] = effectiveReviewer === p
		})

		const waveVerification = settingsManager.getPlanWaveVerification(settings ?? undefined)
		const isHeadless = printOptions?.print ?? false
		const effectiveOneShot = isHeadless ? 'bypassPermissions' as const : (resolvedFlags.oneShot ?? 'default')
		const effectiveAutonomous = effectiveOneShot === 'noReview' || effectiveOneShot === 'bypassPermissions'
		const skipPermissions = effectiveOneShot === 'bypassPermissions' || (resolvedFlags.dangerouslySkipPermissions ?? false)

		logger.debug('Loading plan prompt template')
		const templateVariables: TemplateVariables = {
			IS_VSCODE_MODE: isVscodeMode,
			WAVE_VERIFICATION: waveVerification,
			ISSUE_TRACKER: provider,
			IS_GITHUB_TRACKER: provider === 'github',
			VCS_PROVIDER: settings?.versionControl?.provider ?? 'github',
			IS_GITHUB_VCS: (settings?.versionControl?.provider ?? 'github') === 'github',
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
			PLANNER: effectivePlanner,
			REVIEWER: effectiveReviewer,
			HAS_REVIEWER: effectiveReviewer !== 'none',
			AUTO_SWARM_MODE: autoSwarm,
			AUTONOMOUS_MODE: effectiveAutonomous,
			...providerFlags,
		}
		const architectPrompt = await planningRuntime.getPrompt(this.templateManager, templateVariables)
		logger.debug('Plan prompt loaded', {
			promptLength: architectPrompt.length,
			mode: decompositionContext ? 'decomposition' : 'fresh',
			runtime: planningRuntime.kind,
		})

		let agents: Record<string, unknown> | undefined
		if (planningRuntime.kind === 'claude') {
			try {
				agents = await this.agentManager.loadAndPrepare(
					settings ?? undefined,
					templateVariables,
					['iloom-issue-analyzer.md']
				)
			} catch (error) {
				logger.warn(`Failed to load agents: ${error instanceof Error ? error.message : 'Unknown error'}`)
			}
		}

		if (effectiveAutonomous && !isHeadless && !prompt) {
			throw new Error('Autonomous mode (--one-shot=noReview, --one-shot=bypassPermissions, --autonomous, or --yolo) requires a prompt or issue identifier (e.g., il plan --autonomous "add gitlab support" or il plan --yolo 42)')
		}

		if (skipPermissions) {
			if (effectiveAutonomous) {
				logger.warn(planningRuntime.getAutonomousModeWarning())
			} else {
				logger.warn(
					'Permission bypass enabled - the planning runtime will skip permission prompts. This could destroy important data or make irreversible changes. Proceeding means you accept this risk.'
				)
			}
		}

		logger.debug('Launching planning runtime', {
			runtime: planningRuntime.kind,
			headless: isHeadless,
			hasSystemPrompt: !!architectPrompt,
			workingDirectory: process.cwd(),
			effectiveAutonomous,
			effectiveOneShot,
			autoSwarm,
			print: isHeadless,
		})

		if (planningRuntime.kind === 'claude') {
			try {
				await preAcceptClaudeTrust(process.cwd())
			} catch (error) {
				logger.warn(`Failed to pre-accept Claude trust: ${error instanceof Error ? error.message : String(error)}`)
			}
		}

		let initialMessage: string
		if (decompositionContext) {
			initialMessage = `Break down issue #${decompositionContext.identifier} into child issues.`
		} else if (prompt) {
			initialMessage = prompt
		} else {
			initialMessage = 'Help me plan a feature or decompose work into issues.'
		}

		if (effectiveAutonomous) {
			initialMessage = `[AUTONOMOUS MODE]
Proceed through the flow without requiring user interaction. Make and document your assumptions and proceed to create the epic and child issues and dependencies if necessary. This guidance supersedes all previous guidance.

[TOPIC]
${initialMessage}`
		}

		try {
			const runtimeResult = await planningRuntime.launch(initialMessage, {
				model: effectiveModel,
				modelProvidedByUser,
				yolo: skipPermissions,
				appendSystemPrompt: architectPrompt,
				mcpConfig,
				workingDirectory: process.cwd(),
				additionalWritableDirectories: ['/tmp'],
				...(agents && { agents }),
				...(effectiveEffort && { effort: effectiveEffort }),
				...(autoSwarm !== undefined && { autoSwarm }),
				...(printOptions !== undefined && { printOptions }),
				...(controller && { signal: controller.signal }),
			})

			if (autoSwarm) {
				if (externalHarness) {
					logger.info(chalk.green('Planning session ended. External harness will manage the pipeline.'))
					autoSwarmSuccess = true
					autoSwarmPhaseReached = 'plan'
				} else if (!epicData) {
					throw new Error('Plan phase exited without completing. The Architect did not signal done.')
				} else {
					const resolvedEpicData = epicData as { epicIssueNumber: string; childIssues?: number[] }
					const epicIssueNumber = resolvedEpicData.epicIssueNumber
					const childIssues = resolvedEpicData.childIssues ?? []
					logger.info(chalk.green(`Planning complete. Epic issue: #${epicIssueNumber}`))
					autoSwarmFallbackToNormal = childIssues.length === 0

					const startCommand = new StartCommand(IssueTrackerFactory.create(settings ?? {}))

					if (childIssues.length === 0) {
						logger.info('No child issues created. Starting as a normal autonomous loom.')
						let startResult
						try {
							startResult = await startCommand.execute({
								identifier: String(epicIssueNumber),
								options: { oneShot: 'bypassPermissions', json: true, claude: false, code: false, devServer: false, terminal: false },
							})
						} catch (startError) {
							throw new Error(
								`Auto-swarm: failed to create epic workspace. ${startError instanceof Error ? startError.message : String(startError)}`
							)
						}

						const epicWorktreePath = startResult?.path
						if (!epicWorktreePath) {
							throw new Error('Auto-swarm: StartCommand did not return a workspace path.')
						}

						const igniteCommand = new IgniteCommand()
						await igniteCommand.execute('bypassPermissions', undefined, undefined, epicWorktreePath)
					} else {
						let startResult
						try {
							startResult = await startCommand.execute({
								identifier: String(epicIssueNumber),
								options: { epic: true, json: true, oneShot: 'bypassPermissions', claude: false, code: false, devServer: false, terminal: false },
							})
						} catch (startError) {
							throw new Error(
								`Auto-swarm: failed to create epic workspace. ${startError instanceof Error ? startError.message : String(startError)}`
							)
						}

						const epicWorktreePath = startResult?.path
						if (!epicWorktreePath) {
							throw new Error('Auto-swarm: StartCommand did not return a workspace path.')
						}

						const igniteCommand = new IgniteCommand()
						await igniteCommand.execute('bypassPermissions', undefined, undefined, epicWorktreePath)
					}

					autoSwarmSuccess = true
					autoSwarmPhaseReached = 'spin'
				}
			}

			if (decompositionContext) {
				try {
					const mcpProv = IssueManagementProviderFactory.create(provider as IssueProvider, settings ?? undefined)
					const children = await mcpProv.getChildIssues({ number: decompositionContext.identifier })
					TelemetryService.getInstance().track('epic.planned', {
						child_count: children.length,
						tracker: provider,
					})
				} catch (error) {
					logger.debug(`Telemetry epic.planned tracking failed: ${error instanceof Error ? error.message : error}`)
				}
			}

			if (printOptions?.json) {
				// eslint-disable-next-line no-console
				console.log(JSON.stringify({
					success: true,
					output: runtimeResult ?? '',
				}))
			}

			logger.debug('Planning session completed')
			logger.info(chalk.green('Planning session ended.'))
		} finally {
			if (harness) {
				await harness.stop()
			}

			if (autoSwarm && autoSwarmStartTime !== null) {
				const durationMinutes = (Date.now() - autoSwarmStartTime) / 60000
				const autoSwarmSource = decompositionContext ? 'decomposition' : 'fresh'
				const resolvedEpicData = epicData as { epicIssueNumber: string; childIssues: number[] } | null
				try {
					TelemetryService.getInstance().track('auto_swarm.completed', {
						source: autoSwarmSource,
						success: autoSwarmSuccess,
						child_count: resolvedEpicData?.childIssues.length ?? 0,
						duration_minutes: Math.round(durationMinutes * 10) / 10,
						phase_reached: autoSwarmPhaseReached,
						fallback_to_normal: autoSwarmFallbackToNormal,
					})
				} catch (error) {
					logger.debug(`Telemetry auto_swarm.completed tracking failed: ${error instanceof Error ? error.message : error}`)
				}
			}
		}
	}
}
