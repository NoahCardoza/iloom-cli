import { detectClaudeCli, launchClaude, ClaudeCliOptions, generateBranchName } from '../utils/claude.js'
import { PromptTemplateManager, TemplateVariables } from './PromptTemplateManager.js'
import { logger } from '../utils/logger.js'

export interface ClaudeWorkflowOptions {
	type: 'issue' | 'pr' | 'regular'
	issueNumber?: number
	prNumber?: number
	title?: string
	workspacePath: string
	port?: number
	headless?: boolean
	branchName?: string
}

export class ClaudeService {
	private templateManager: PromptTemplateManager

	constructor(templateManager?: PromptTemplateManager) {
		this.templateManager = templateManager ?? new PromptTemplateManager()
	}

	/**
	 * Check if Claude CLI is available
	 */
	async isAvailable(): Promise<boolean> {
		return detectClaudeCli()
	}

	/**
	 * Get the appropriate model for a workflow type
	 */
	private getModelForWorkflow(type: 'issue' | 'pr' | 'regular'): string | undefined {
		// Issue workflows use claude-sonnet-4-20250514
		if (type === 'issue') {
			return 'claude-sonnet-4-20250514'
		}
		// For PR and regular workflows, use Claude's default model
		return undefined
	}

	/**
	 * Get the appropriate permission mode for a workflow type
	 */
	private getPermissionModeForWorkflow(
		type: 'issue' | 'pr' | 'regular'
	): ClaudeCliOptions['permissionMode'] {
		// Issue workflows use acceptEdits mode
		if (type === 'issue') {
			return 'acceptEdits'
		}
		// For PR and regular workflows, use default permissions
		return 'default'
	}

	/**
	 * Launch Claude for a specific workflow
	 */
	async launchForWorkflow(options: ClaudeWorkflowOptions): Promise<string | void> {
		const { type, issueNumber, prNumber, title, workspacePath, port, headless = false, branchName } = options

		try {
			// Build template variables
			const variables: TemplateVariables = {
				WORKSPACE_PATH: workspacePath,
			}

			if (issueNumber !== undefined) {
				variables.ISSUE_NUMBER = issueNumber
			}

			if (prNumber !== undefined) {
				variables.PR_NUMBER = prNumber
			}

			if (title !== undefined) {
				if (type === 'issue') {
					variables.ISSUE_TITLE = title
				} else if (type === 'pr') {
					variables.PR_TITLE = title
				}
			}

			if (port !== undefined) {
				variables.PORT = port
			}

			// Get the prompt from template manager
			const prompt = await this.templateManager.getPrompt(type, variables)

			// Determine model and permission mode
			const model = this.getModelForWorkflow(type)
			const permissionMode = this.getPermissionModeForWorkflow(type)

			// Build Claude CLI options
			const claudeOptions: ClaudeCliOptions = {
				addDir: workspacePath,
				headless,
			}

			// Add optional model if present
			if (model !== undefined) {
				claudeOptions.model = model
			}

			// Add permission mode if not default
			if (permissionMode !== undefined && permissionMode !== 'default') {
				claudeOptions.permissionMode = permissionMode
			}

			// Add optional branch name for terminal coloring
			if (branchName !== undefined) {
				claudeOptions.branchName = branchName
			}

			logger.debug('Launching Claude for workflow', {
				type,
				model,
				permissionMode,
				headless,
				workspacePath,
			})

			// Launch Claude
			return await launchClaude(prompt, claudeOptions)
		} catch (error) {
			logger.error('Failed to launch Claude for workflow', { error, options })
			throw error
		}
	}

	/**
	 * Generate branch name with Claude, with fallback on failure
	 */
	async generateBranchNameWithFallback(issueTitle: string, issueNumber: number): Promise<string> {
		try {
			return await generateBranchName(issueTitle, issueNumber)
		} catch (error) {
			logger.warn('Claude branch name generation failed, using fallback', { error })
			return `feat/issue-${issueNumber}`
		}
	}
}
