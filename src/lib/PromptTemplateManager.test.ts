import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PromptTemplateManager, TemplateVariables } from './PromptTemplateManager.js'
import { readFile } from 'fs/promises'

vi.mock('fs/promises')
vi.mock('../utils/logger.js', () => ({
	logger: {
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}))

describe('PromptTemplateManager', () => {
	let manager: PromptTemplateManager

	beforeEach(() => {
		manager = new PromptTemplateManager('templates/prompts')
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe('loadTemplate', () => {
		it('should load issue template successfully', async () => {
			const templateContent = 'Issue template with ISSUE_NUMBER'
			vi.mocked(readFile).mockResolvedValueOnce(templateContent)

			const result = await manager.loadTemplate('issue')

			expect(result).toBe(templateContent)
			expect(readFile).toHaveBeenCalledWith('templates/prompts/issue-prompt.txt', 'utf-8')
		})

		it('should load pr template successfully', async () => {
			const templateContent = 'PR template with PR_NUMBER'
			vi.mocked(readFile).mockResolvedValueOnce(templateContent)

			const result = await manager.loadTemplate('pr')

			expect(result).toBe(templateContent)
			expect(readFile).toHaveBeenCalledWith('templates/prompts/pr-prompt.txt', 'utf-8')
		})

		it('should load regular template successfully', async () => {
			const templateContent = 'Regular template'
			vi.mocked(readFile).mockResolvedValueOnce(templateContent)

			const result = await manager.loadTemplate('regular')

			expect(result).toBe(templateContent)
			expect(readFile).toHaveBeenCalledWith('templates/prompts/regular-prompt.txt', 'utf-8')
		})

		it('should throw error when template file is not found', async () => {
			vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT: no such file'))

			await expect(manager.loadTemplate('issue')).rejects.toThrow(
				'Template not found: templates/prompts/issue-prompt.txt'
			)
		})

		it('should use custom template directory when provided', async () => {
			const customManager = new PromptTemplateManager('custom/templates')
			const templateContent = 'Custom template'
			vi.mocked(readFile).mockResolvedValueOnce(templateContent)

			await customManager.loadTemplate('issue')

			expect(readFile).toHaveBeenCalledWith('custom/templates/issue-prompt.txt', 'utf-8')
		})
	})

	describe('substituteVariables', () => {
		it('should substitute ISSUE_NUMBER variable', () => {
			const template = 'Work on issue ISSUE_NUMBER'
			const variables: TemplateVariables = { ISSUE_NUMBER: 123 }

			const result = manager.substituteVariables(template, variables)

			expect(result).toBe('Work on issue 123')
		})

		it('should substitute PR_NUMBER variable', () => {
			const template = 'Review PR PR_NUMBER'
			const variables: TemplateVariables = { PR_NUMBER: 456 }

			const result = manager.substituteVariables(template, variables)

			expect(result).toBe('Review PR 456')
		})

		it('should substitute ISSUE_TITLE variable', () => {
			const template = 'Title: ISSUE_TITLE'
			const variables: TemplateVariables = { ISSUE_TITLE: 'Add authentication' }

			const result = manager.substituteVariables(template, variables)

			expect(result).toBe('Title: Add authentication')
		})

		it('should substitute PR_TITLE variable', () => {
			const template = 'PR: PR_TITLE'
			const variables: TemplateVariables = { PR_TITLE: 'Fix bug in login' }

			const result = manager.substituteVariables(template, variables)

			expect(result).toBe('PR: Fix bug in login')
		})

		it('should substitute WORKSPACE_PATH variable', () => {
			const template = 'Working in WORKSPACE_PATH'
			const variables: TemplateVariables = { WORKSPACE_PATH: '/path/to/workspace' }

			const result = manager.substituteVariables(template, variables)

			expect(result).toBe('Working in /path/to/workspace')
		})

		it('should substitute PORT variable', () => {
			const template = 'Dev server on PORT'
			const variables: TemplateVariables = { PORT: 3123 }

			const result = manager.substituteVariables(template, variables)

			expect(result).toBe('Dev server on 3123')
		})

		it('should substitute multiple variables', () => {
			const template = 'Issue ISSUE_NUMBER: ISSUE_TITLE at WORKSPACE_PATH'
			const variables: TemplateVariables = {
				ISSUE_NUMBER: 123,
				ISSUE_TITLE: 'Add feature',
				WORKSPACE_PATH: '/workspace',
			}

			const result = manager.substituteVariables(template, variables)

			expect(result).toBe('Issue 123: Add feature at /workspace')
		})

		it('should substitute all occurrences of a variable', () => {
			const template = 'ISSUE_NUMBER is important. Work on ISSUE_NUMBER now.'
			const variables: TemplateVariables = { ISSUE_NUMBER: 123 }

			const result = manager.substituteVariables(template, variables)

			expect(result).toBe('123 is important. Work on 123 now.')
		})

		it('should handle empty variables object', () => {
			const template = 'Work on ISSUE_NUMBER'
			const variables: TemplateVariables = {}

			const result = manager.substituteVariables(template, variables)

			expect(result).toBe('Work on ISSUE_NUMBER')
		})

		it('should only substitute defined variables', () => {
			const template = 'Issue ISSUE_NUMBER and PR PR_NUMBER'
			const variables: TemplateVariables = { ISSUE_NUMBER: 123 }

			const result = manager.substituteVariables(template, variables)

			expect(result).toBe('Issue 123 and PR PR_NUMBER')
		})

		it('should handle undefined variable values by not substituting', () => {
			const template = 'Issue ISSUE_NUMBER'
			const variables: TemplateVariables = { ISSUE_NUMBER: undefined }

			const result = manager.substituteVariables(template, variables)

			expect(result).toBe('Issue ISSUE_NUMBER')
		})

		it('should include conditional section when ONE_SHOT_MODE is true', () => {
			const template = 'Start{{#IF ONE_SHOT_MODE}} one-shot content {{/IF ONE_SHOT_MODE}}End'
			const variables: TemplateVariables = { ONE_SHOT_MODE: true }

			const result = manager.substituteVariables(template, variables)

			expect(result).toBe('Start one-shot content End')
		})

		it('should exclude conditional section when ONE_SHOT_MODE is false', () => {
			const template = 'Start{{#IF ONE_SHOT_MODE}} one-shot content {{/IF ONE_SHOT_MODE}}End'
			const variables: TemplateVariables = { ONE_SHOT_MODE: false }

			const result = manager.substituteVariables(template, variables)

			expect(result).toBe('StartEnd')
		})

		it('should exclude conditional section when ONE_SHOT_MODE is undefined', () => {
			const template = 'Start{{#IF ONE_SHOT_MODE}} one-shot content {{/IF ONE_SHOT_MODE}}End'
			const variables: TemplateVariables = {}

			const result = manager.substituteVariables(template, variables)

			expect(result).toBe('StartEnd')
		})

		it('should handle multi-line conditional sections', () => {
			const template = `Header
{{#IF ONE_SHOT_MODE}}
Line 1
Line 2
Line 3
{{/IF ONE_SHOT_MODE}}
Footer`
			const variables: TemplateVariables = { ONE_SHOT_MODE: true }

			const result = manager.substituteVariables(template, variables)

			expect(result).toBe(`Header

Line 1
Line 2
Line 3

Footer`)
		})

		it('should process conditionals before variable substitution', () => {
			const template = '{{#IF ONE_SHOT_MODE}}Issue ISSUE_NUMBER{{/IF ONE_SHOT_MODE}}'
			const variables: TemplateVariables = { ONE_SHOT_MODE: true, ISSUE_NUMBER: 123 }

			const result = manager.substituteVariables(template, variables)

			expect(result).toBe('Issue 123')
		})

		it('should handle multiple conditional sections in same template', () => {
			const template = '{{#IF ONE_SHOT_MODE}}First{{/IF ONE_SHOT_MODE}} Middle {{#IF ONE_SHOT_MODE}}Second{{/IF ONE_SHOT_MODE}}'
			const variables: TemplateVariables = { ONE_SHOT_MODE: true }

			const result = manager.substituteVariables(template, variables)

			expect(result).toBe('First Middle Second')
		})

		it('should include conditional section when INTERACTIVE_MODE is true', () => {
			const template = 'Start{{#IF INTERACTIVE_MODE}} interactive content {{/IF INTERACTIVE_MODE}}End'
			const variables: TemplateVariables = { INTERACTIVE_MODE: true }

			const result = manager.substituteVariables(template, variables)

			expect(result).toBe('Start interactive content End')
		})

		it('should exclude conditional section when INTERACTIVE_MODE is false', () => {
			const template = 'Start{{#IF INTERACTIVE_MODE}} interactive content {{/IF INTERACTIVE_MODE}}End'
			const variables: TemplateVariables = { INTERACTIVE_MODE: false }

			const result = manager.substituteVariables(template, variables)

			expect(result).toBe('StartEnd')
		})

		it('should exclude conditional section when INTERACTIVE_MODE is undefined', () => {
			const template = 'Start{{#IF INTERACTIVE_MODE}} interactive content {{/IF INTERACTIVE_MODE}}End'
			const variables: TemplateVariables = {}

			const result = manager.substituteVariables(template, variables)

			expect(result).toBe('StartEnd')
		})

		it('should handle multi-line INTERACTIVE_MODE conditional sections', () => {
			const template = `Header
{{#IF INTERACTIVE_MODE}}
2.5. Extract and validate assumptions (batched validation):
   - Read the agent's output
   - Use AskUserQuestion tool
{{/IF INTERACTIVE_MODE}}
Footer`
			const variables: TemplateVariables = { INTERACTIVE_MODE: true }

			const result = manager.substituteVariables(template, variables)

			expect(result).toContain('Extract and validate assumptions')
			expect(result).toContain('AskUserQuestion tool')
		})
	})

	describe('getPrompt', () => {
		it('should load and substitute variables for issue template', async () => {
			const template = 'Work on issue ISSUE_NUMBER: ISSUE_TITLE'
			vi.mocked(readFile).mockResolvedValueOnce(template)

			const variables: TemplateVariables = {
				ISSUE_NUMBER: 123,
				ISSUE_TITLE: 'Add authentication',
			}

			const result = await manager.getPrompt('issue', variables)

			expect(result).toBe('Work on issue 123: Add authentication')
			expect(readFile).toHaveBeenCalledWith('templates/prompts/issue-prompt.txt', 'utf-8')
		})

		it('should load and substitute variables for pr template', async () => {
			const template = 'Review PR PR_NUMBER'
			vi.mocked(readFile).mockResolvedValueOnce(template)

			const variables: TemplateVariables = { PR_NUMBER: 456 }

			const result = await manager.getPrompt('pr', variables)

			expect(result).toBe('Review PR 456')
			expect(readFile).toHaveBeenCalledWith('templates/prompts/pr-prompt.txt', 'utf-8')
		})

		it('should load regular template without substitution', async () => {
			const template = 'Regular workflow instructions'
			vi.mocked(readFile).mockResolvedValueOnce(template)

			const result = await manager.getPrompt('regular', {})

			expect(result).toBe('Regular workflow instructions')
			expect(readFile).toHaveBeenCalledWith('templates/prompts/regular-prompt.txt', 'utf-8')
		})

		it('should handle template loading errors', async () => {
			vi.mocked(readFile).mockRejectedValueOnce(new Error('File not found'))

			await expect(manager.getPrompt('issue', {})).rejects.toThrow(
				'Template not found: templates/prompts/issue-prompt.txt'
			)
		})

		it('should handle complex variable substitution', async () => {
			const template =
				'Issue ISSUE_NUMBER at WORKSPACE_PATH\nTitle: ISSUE_TITLE\nPort: PORT'
			vi.mocked(readFile).mockResolvedValueOnce(template)

			const variables: TemplateVariables = {
				ISSUE_NUMBER: 789,
				ISSUE_TITLE: 'Complex feature',
				WORKSPACE_PATH: '/complex/path',
				PORT: 3789,
			}

			const result = await manager.getPrompt('issue', variables)

			expect(result).toBe(
				'Issue 789 at /complex/path\nTitle: Complex feature\nPort: 3789'
			)
		})

		it('should process conditional sections and variables together', async () => {
			const template = 'Issue ISSUE_NUMBER{{#IF ONE_SHOT_MODE}} (one-shot mode){{/IF ONE_SHOT_MODE}}'
			vi.mocked(readFile).mockResolvedValueOnce(template)

			const variables: TemplateVariables = {
				ISSUE_NUMBER: 123,
				ONE_SHOT_MODE: true,
			}

			const result = await manager.getPrompt('issue', variables)

			expect(result).toBe('Issue 123 (one-shot mode)')
		})

		it('should exclude conditional sections when ONE_SHOT_MODE is false', async () => {
			const template = 'Issue ISSUE_NUMBER{{#IF ONE_SHOT_MODE}} (one-shot mode){{/IF ONE_SHOT_MODE}}'
			vi.mocked(readFile).mockResolvedValueOnce(template)

			const variables: TemplateVariables = {
				ISSUE_NUMBER: 123,
				ONE_SHOT_MODE: false,
			}

			const result = await manager.getPrompt('issue', variables)

			expect(result).toBe('Issue 123')
		})
	})
})
