import { ClaudeService, ClaudeWorkflowOptions } from './ClaudeService.js'
import { PromptTemplateManager } from './PromptTemplateManager.js'
import { logger } from '../utils/logger.js'

export interface ClaudeContext {
	type: 'issue' | 'pr' | 'regular'
	identifier: number | string
	title?: string
	workspacePath: string
	port?: number
	branchName?: string
}

export class ClaudeContextManager {
	private claudeService: ClaudeService

	constructor(claudeService?: ClaudeService, _promptTemplateManager?: PromptTemplateManager) {
		this.claudeService = claudeService ?? new ClaudeService()
		// promptTemplateManager is accepted for dependency injection but not used yet
		// Will be used in Issue #11 for .claude-context.md generation
	}

	/**
	 * Prepare context for Claude launch
	 * Placeholder for future .claude-context.md generation (Issue #11)
	 */
	async prepareContext(context: ClaudeContext): Promise<void> {
		// Validate context object
		if (!context.workspacePath) {
			throw new Error('Workspace path is required')
		}

		if (context.type === 'issue' && typeof context.identifier !== 'number') {
			throw new Error('Issue identifier must be a number')
		}

		if (context.type === 'pr' && typeof context.identifier !== 'number') {
			throw new Error('PR identifier must be a number')
		}

		logger.debug('Context prepared', { context })
		// Future: Generate .claude-context.md file in workspace
	}

	/**
	 * Launch Claude with the prepared context
	 */
	async launchWithContext(context: ClaudeContext, headless: boolean = false): Promise<string | void> {
		// Prepare context first
		await this.prepareContext(context)

		// Convert ClaudeContext to ClaudeWorkflowOptions
		const workflowOptions: ClaudeWorkflowOptions = {
			type: context.type,
			workspacePath: context.workspacePath,
			...(context.port !== undefined && { port: context.port }),
			headless,
		}

		// Add optional title if present
		if (context.title !== undefined) {
			workflowOptions.title = context.title
		}

		// Add optional branch name if present
		if (context.branchName !== undefined) {
			workflowOptions.branchName = context.branchName
		}

		// Set issue or PR number based on type
		if (context.type === 'issue') {
			workflowOptions.issueNumber = context.identifier as number
		} else if (context.type === 'pr') {
			workflowOptions.prNumber = context.identifier as number
		}

		// Delegate to Claude service
		return this.claudeService.launchForWorkflow(workflowOptions)
	}
}
