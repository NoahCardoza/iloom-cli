/* global AbortSignal */
import type { PromptTemplateManager, TemplateVariables } from '../lib/PromptTemplateManager.js'
import { detectClaudeCli, launchClaude, type ClaudeCliOptions } from '../utils/claude.js'
import { detectCodexCli, launchCodex } from '../utils/codex.js'
import { prepareSystemPromptForPlatform } from '../utils/system-prompt-writer.js'
import type { EffortLevel } from '../types/index.js'

export type PlannerProvider = 'claude' | 'gemini' | 'codex'
export type ReviewerProvider = 'claude' | 'gemini' | 'codex' | 'none'

export interface PlanPrintOptions {
	print?: boolean
	outputFormat?: 'json' | 'stream-json' | 'text'
	verbose?: boolean
	json?: boolean
	jsonStream?: boolean
}

export interface PlanningRuntimeLaunchOptions {
	model?: string
	modelProvidedByUser?: boolean
	yolo?: boolean
	autoSwarm?: boolean
	printOptions?: PlanPrintOptions
	appendSystemPrompt: string
	mcpConfig: Record<string, unknown>[]
	workingDirectory: string
	additionalWritableDirectories?: string[]
	agents?: Record<string, unknown>
	effort?: EffortLevel
	signal?: AbortSignal
}

export interface PlanningRuntimeValidationOptions {
	planner?: PlannerProvider
	reviewer: ReviewerProvider
	autoSwarm?: boolean
	model?: string
	modelProvidedByUser?: boolean
}

export interface PlanningRuntime {
	readonly kind: 'claude' | 'codex'
	validate(options: PlanningRuntimeValidationOptions): void
	ensureCliAvailable(): Promise<void>
	getPrompt(
		templateManager: PromptTemplateManager,
		templateVariables: TemplateVariables
	): Promise<string>
	launch(initialMessage: string, options: PlanningRuntimeLaunchOptions): Promise<string | void>
	getAutonomousModeWarning(): string
}

const CLAUDE_MODEL_SHORTHAND_PATTERN = /^(opus|sonnet|haiku)(\[1m\])?$/

function isClaudeModelName(model: string): boolean {
	return CLAUDE_MODEL_SHORTHAND_PATTERN.test(model) || model.startsWith('claude-')
}

export class ClaudePlanningRuntime implements PlanningRuntime {
	public readonly kind = 'claude' as const

	validate(options: PlanningRuntimeValidationOptions): void {
		if ((options.planner ?? 'claude') === 'claude' && options.modelProvidedByUser && options.model && !isClaudeModelName(options.model)) {
			throw new Error(`Claude planning only accepts Claude model names. Received "${options.model}". Use a Claude shorthand, a claude-* model ID, or switch to --planner codex for Codex models.`)
		}
	}

	async ensureCliAvailable(): Promise<void> {
		const claudeAvailable = await detectClaudeCli()
		if (!claudeAvailable) {
			throw new Error('Claude Code CLI is required for planning sessions')
		}
	}

	getPrompt(
		templateManager: PromptTemplateManager,
		templateVariables: TemplateVariables
	): Promise<string> {
		return templateManager.getPrompt('plan', templateVariables)
	}

	async launch(
		initialMessage: string,
		options: PlanningRuntimeLaunchOptions
	): Promise<string | void> {
		const isHeadless = options.printOptions?.print ?? false
		const systemPromptConfig = await prepareSystemPromptForPlatform(
			options.appendSystemPrompt,
			options.workingDirectory,
		)
		const claudeOptions: ClaudeCliOptions = {
			headless: isHeadless,
			appendSystemPromptFile: systemPromptConfig.appendSystemPromptFile,
			mcpConfig: options.mcpConfig,
			addDir: options.workingDirectory,
			allowedTools: getClaudeAllowedTools(options.autoSwarm ?? false),
			...(options.model && { model: options.model }),
			...(options.agents && { agents: options.agents }),
			...(options.effort && { effort: options.effort }),
		}

		if (options.printOptions?.outputFormat !== undefined) {
			claudeOptions.outputFormat = options.printOptions.outputFormat
		}
		if (options.printOptions?.verbose !== undefined) {
			claudeOptions.verbose = options.printOptions.verbose
		}

		if (options.printOptions?.json) {
			claudeOptions.jsonMode = 'json'
			claudeOptions.outputFormat = 'stream-json'
		} else if (options.printOptions?.jsonStream) {
			claudeOptions.jsonMode = 'stream'
			claudeOptions.outputFormat = 'stream-json'
		}

		const effectiveYolo = (options.yolo ?? false) || isHeadless

		return launchClaude(initialMessage, {
			...claudeOptions,
			...(effectiveYolo && { permissionMode: 'bypassPermissions' as const }),
			...(options.signal && { signal: options.signal }),
		})
	}

	getAutonomousModeWarning(): string {
		return 'YOLO mode enabled - Claude will skip permission prompts and proceed autonomously. This could destroy important data or make irreversible changes. Proceeding means you accept this risk.'
	}
}

export class CodexPlanningRuntime implements PlanningRuntime {
	public readonly kind = 'codex' as const

	validate(options: PlanningRuntimeValidationOptions): void {
		if (options.reviewer !== 'none') {
			throw new Error('Codex planning does not support reviewers yet. Use --reviewer none or set plan.reviewer to "none".')
		}

		if (options.autoSwarm) {
			throw new Error('Codex planning does not support --auto-swarm yet. Use --planner claude for auto-swarm planning.')
		}

		if (options.modelProvidedByUser && options.model && isClaudeModelName(options.model)) {
			throw new Error(`Codex planning does not accept Claude model "${options.model}". Omit --model to use Codex defaults, or pass a Codex model name.`)
		}
	}

	async ensureCliAvailable(): Promise<void> {
		const codexAvailable = await detectCodexCli()
		if (!codexAvailable) {
			throw new Error('Codex CLI is required for Codex planning sessions')
		}
	}

	getPrompt(
		templateManager: PromptTemplateManager,
		templateVariables: TemplateVariables
	): Promise<string> {
		return templateManager.getPrompt('plan-codex', templateVariables)
	}

	async launch(
		initialMessage: string,
		options: PlanningRuntimeLaunchOptions
	): Promise<string | void> {
		const isHeadless = options.printOptions?.print ?? false
		const jsonMode =
			options.printOptions?.json
				? 'json'
				: options.printOptions?.jsonStream
					? 'stream'
					: options.printOptions?.outputFormat === 'json'
						? 'json'
						: options.printOptions?.outputFormat === 'stream-json'
							? 'stream'
							: undefined

		const explicitCodexModel = options.modelProvidedByUser ? options.model : undefined

		return launchCodex(initialMessage, {
			headless: isHeadless,
			fullAuto: isHeadless,
			sandbox: 'workspace-write',
			approvalPolicy: (options.yolo ?? false) ? 'never' : 'on-request',
			appendSystemPrompt: options.appendSystemPrompt,
			mcpConfig: options.mcpConfig,
			workingDirectory: options.workingDirectory,
			passthroughStdout: jsonMode === 'stream',
			env: { ILOOM_CLI_PLANNER: 'codex' },
			...(options.additionalWritableDirectories && { addDirs: options.additionalWritableDirectories }),
			...(jsonMode && { jsonMode }),
			...(explicitCodexModel && { model: explicitCodexModel }),
			...(options.signal && { signal: options.signal }),
		})
	}

	getAutonomousModeWarning(): string {
		return 'YOLO mode enabled - Codex will skip permission prompts and proceed autonomously. This could destroy important data or make irreversible changes. Proceeding means you accept this risk.'
	}
}

export function createPlanningRuntime(planner: PlannerProvider): PlanningRuntime {
	if (planner === 'codex') {
		return new CodexPlanningRuntime()
	}

	return new ClaudePlanningRuntime()
}

function getClaudeAllowedTools(autoSwarm: boolean): string[] {
	const allowedTools = [
		'mcp__issue_management__create_issue',
		'mcp__issue_management__create_child_issue',
		'mcp__issue_management__get_issue',
		'mcp__issue_management__get_child_issues',
		'mcp__issue_management__get_comment',
		'mcp__issue_management__create_comment',
		'mcp__issue_management__create_dependency',
		'mcp__issue_management__get_dependencies',
		'mcp__issue_management__remove_dependency',
		'Read',
		'Glob',
		'Grep',
		'Task',
		'WebFetch',
		'WebSearch',
		'Bash(git status:*)',
		'Bash(git log:*)',
		'Bash(git branch:*)',
		'Bash(git remote:*)',
		'Bash(git diff:*)',
		'Bash(git show:*)',
	]

	if (autoSwarm) {
		allowedTools.push('mcp__harness__signal')
	}

	return allowedTools
}
