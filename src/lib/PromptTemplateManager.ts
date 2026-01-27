import { readFile } from 'fs/promises'
import { accessSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Handlebars from 'handlebars'
import { logger } from '../utils/logger.js'

// Register raw helper to handle content with curly braces (e.g., JSON)
// Usage: {{{{raw}}}}{{VARIABLE}}{{{{/raw}}}}
// This outputs the variable content as-is without Handlebars parsing its curly braces
Handlebars.registerHelper('raw', function (this: unknown, options: Handlebars.HelperOptions) {
	return options.fn(this)
})

export interface TemplateVariables {
	ISSUE_NUMBER?: string | number
	PR_NUMBER?: number
	ISSUE_TITLE?: string
	PR_TITLE?: string
	WORKSPACE_PATH?: string
	PORT?: number
	ONE_SHOT_MODE?: boolean
	INTERACTIVE_MODE?: boolean
	SETTINGS_SCHEMA?: string
	SETTINGS_GLOBAL_JSON?: string
	SETTINGS_JSON?: string
	SETTINGS_LOCAL_JSON?: string
	SHELL_TYPE?: string
	SHELL_CONFIG_PATH?: string
	SHELL_CONFIG_CONTENT?: string
	REMOTES_INFO?: string
	MULTIPLE_REMOTES?: string
	SINGLE_REMOTE?: string
	SINGLE_REMOTE_NAME?: string
	SINGLE_REMOTE_URL?: string
	NO_REMOTES?: string
	README_CONTENT?: string
	SETTINGS_SCHEMA_CONTENT?: string
	FIRST_TIME_USER?: boolean
	VSCODE_SETTINGS_GITIGNORED?: string
	// Session summary template variables
	SESSION_CONTEXT?: string  // Session ID for Claude to reference its conversation
	BRANCH_NAME?: string      // Branch being finished
	LOOM_TYPE?: string        // 'issue' or 'pr'
	COMPACT_SUMMARIES?: string  // Extracted compact summaries from session transcript
	RECAP_DATA?: string  // Formatted recap data (goal, complexity, entries, artifacts)
	// Draft PR mode variables - mutually exclusive with standard issue mode
	DRAFT_PR_NUMBER?: number  // PR number for draft PR workflow
	DRAFT_PR_MODE?: boolean   // True when using github-draft-pr merge mode
	STANDARD_ISSUE_MODE?: boolean  // True when using standard issue commenting (not draft PR)
	// VS Code environment detection
	IS_VSCODE_MODE?: boolean  // True when ILOOM_VSCODE=1 environment variable is set
	// Multi-language support variables - mutually exclusive
	HAS_PACKAGE_JSON?: boolean  // True when project has package.json
	NO_PACKAGE_JSON?: boolean   // True when project does not have package.json (non-Node.js projects)
	// Review agent configuration variables
	REVIEW_ENABLED?: boolean               // True if review is enabled (defaults to true)
	REVIEW_CLAUDE_MODEL?: string           // Claude model if configured (defaults to 'sonnet')
	REVIEW_GEMINI_MODEL?: string           // Gemini model if configured
	REVIEW_CODEX_MODEL?: string            // Codex model if configured
	HAS_REVIEW_CLAUDE?: boolean            // True if claude provider configured (defaults to true)
	HAS_REVIEW_GEMINI?: boolean            // True if gemini provider configured
	HAS_REVIEW_CODEX?: boolean             // True if codex provider configured
}

export class PromptTemplateManager {
	private templateDir: string

	constructor(templateDir?: string) {
		if (templateDir) {
			this.templateDir = templateDir
		} else {
			// Find templates relative to the package installation
			// When running from dist/, templates are copied to dist/prompts/
			const currentFileUrl = import.meta.url
			const currentFilePath = fileURLToPath(currentFileUrl)
			const distDir = path.dirname(currentFilePath) // dist directory (may be chunked file location)

			// Walk up to find the dist directory (in case of chunked files)
			let templateDir = path.join(distDir, 'prompts')
			let currentDir = distDir

			// Try to find the prompts directory by walking up
			while (currentDir !== path.dirname(currentDir)) {
				const candidatePath = path.join(currentDir, 'prompts')
				try {
					// Check if this directory exists (sync check for constructor)
					accessSync(candidatePath)
					templateDir = candidatePath
					break
				} catch {
					currentDir = path.dirname(currentDir)
				}
			}

			this.templateDir = templateDir
			logger.debug('PromptTemplateManager initialized', {
				currentFilePath,
				distDir,
				templateDir: this.templateDir
			})
		}
	}

	/**
	 * Load a template file by name
	 */
	async loadTemplate(templateName: 'issue' | 'pr' | 'regular' | 'init' | 'session-summary' | 'plan'): Promise<string> {
		const templatePath = path.join(this.templateDir, `${templateName}-prompt.txt`)

		logger.debug('Loading template', {
			templateName,
			templateDir: this.templateDir,
			templatePath
		})

		try {
			return await readFile(templatePath, 'utf-8')
		} catch (error) {
			logger.error('Failed to load template', { templateName, templatePath, error })
			throw new Error(`Template not found: ${templatePath}`)
		}
	}

	/**
	 * Substitute variables in a template string using Handlebars
	 */
	substituteVariables(template: string, variables: TemplateVariables): string {
		const compiled = Handlebars.compile(template, { noEscape: true })
		return compiled(variables)
	}

	/**
	 * Get a fully processed prompt for a workflow type
	 */
	async getPrompt(
		type: 'issue' | 'pr' | 'regular' | 'init' | 'session-summary' | 'plan',
		variables: TemplateVariables
	): Promise<string> {
		const template = await this.loadTemplate(type)
		return this.substituteVariables(template, variables)
	}
}
