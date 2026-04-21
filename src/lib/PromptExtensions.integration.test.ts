import { describe, it, expect, vi } from 'vitest'
import path from 'path'
import { PromptTemplateManager, TemplateVariables } from './PromptTemplateManager.js'

// Do NOT mock fs/promises here — this test renders real template files.
vi.mock('../utils/logger.js', () => ({
	logger: {
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}))

/**
 * Integration test confirming the ILOOM.md guidance block renders correctly
 * into a real prompt template when `ILOOM_MD_CONTENT` is populated, and is
 * omitted when empty.
 */
describe('PromptTemplateManager: ILOOM.md guidance injection (integration)', () => {
	const templatesDir = path.resolve(process.cwd(), 'templates', 'prompts')
	const manager = new PromptTemplateManager(templatesDir)

	// Minimal variables required for issue-prompt.txt to render without errors.
	const baseVariables: TemplateVariables = {
		WORKSPACE_PATH: '/tmp/test-workspace',
		ISSUE_NUMBER: 42,
		ILOOM_MD_CONTENT: '',
	}

	const SENTINEL = '# Project Conventions\n- Use tabs\n- Prefer composition'

	it('includes the Repository Guidance section when ILOOM_MD_CONTENT is non-empty', async () => {
		const result = await manager.getPrompt('issue', {
			...baseVariables,
			ILOOM_MD_CONTENT: SENTINEL,
		})

		expect(result).toContain('Repository Guidance (from ILOOM.md)')
		expect(result).toContain(SENTINEL)
	})

	it('omits the Repository Guidance section when ILOOM_MD_CONTENT is empty', async () => {
		const result = await manager.getPrompt('issue', {
			...baseVariables,
			ILOOM_MD_CONTENT: '',
		})

		expect(result).not.toContain('Repository Guidance (from ILOOM.md)')
	})
})
