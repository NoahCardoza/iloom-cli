import { readFile } from 'fs/promises'
import path from 'path'
import { logger } from '../utils/logger.js'

export interface TemplateVariables {
	ISSUE_NUMBER?: number
	PR_NUMBER?: number
	ISSUE_TITLE?: string
	PR_TITLE?: string
	WORKSPACE_PATH?: string
	PORT?: number
}

export class PromptTemplateManager {
	private templateDir: string

	constructor(templateDir: string = 'templates/prompts') {
		this.templateDir = templateDir
	}

	/**
	 * Load a template file by name
	 */
	async loadTemplate(templateName: 'issue' | 'pr' | 'regular'): Promise<string> {
		const templatePath = path.join(this.templateDir, `${templateName}-prompt.txt`)

		try {
			const content = await readFile(templatePath, 'utf-8')
			return content
		} catch (error) {
			logger.error('Failed to load template', { templateName, templatePath, error })
			throw new Error(`Template not found: ${templatePath}`)
		}
	}

	/**
	 * Substitute variables in a template string
	 */
	substituteVariables(template: string, variables: TemplateVariables): string {
		let result = template

		// Replace each variable if it exists
		if (variables.ISSUE_NUMBER !== undefined) {
			result = result.replace(/ISSUE_NUMBER/g, String(variables.ISSUE_NUMBER))
		}

		if (variables.PR_NUMBER !== undefined) {
			result = result.replace(/PR_NUMBER/g, String(variables.PR_NUMBER))
		}

		if (variables.ISSUE_TITLE !== undefined) {
			result = result.replace(/ISSUE_TITLE/g, variables.ISSUE_TITLE)
		}

		if (variables.PR_TITLE !== undefined) {
			result = result.replace(/PR_TITLE/g, variables.PR_TITLE)
		}

		if (variables.WORKSPACE_PATH !== undefined) {
			result = result.replace(/WORKSPACE_PATH/g, variables.WORKSPACE_PATH)
		}

		if (variables.PORT !== undefined) {
			result = result.replace(/PORT/g, String(variables.PORT))
		}

		return result
	}

	/**
	 * Get a fully processed prompt for a workflow type
	 */
	async getPrompt(
		type: 'issue' | 'pr' | 'regular',
		variables: TemplateVariables
	): Promise<string> {
		const template = await this.loadTemplate(type)
		return this.substituteVariables(template, variables)
	}
}
