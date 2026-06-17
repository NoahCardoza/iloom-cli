import { describe, it, expect } from 'vitest'
import { PromptTemplateManager } from '../lib/PromptTemplateManager.js'
import { CodexPlanningRuntime } from './plan-runtime.js'

describe('plan prompt templates', () => {
	const templateManager = new PromptTemplateManager('templates/prompts')

	it('removes the old Codex-as-MCP planning branch from the Claude template', async () => {
		const prompt = await templateManager.getPrompt('plan', {
			FRESH_PLANNING_MODE: true,
			PLANNER: 'claude',
			REVIEWER: 'none',
		})

		expect(prompt).not.toContain('Using Codex for Planning (via MCP)')
		expect(prompt).toContain('Default Planning (Claude)')
	})

	it('uses a Codex-specific prompt without Claude-only subagent or AskUserQuestion guidance', async () => {
		const runtime = new CodexPlanningRuntime()
		const prompt = await runtime.getPrompt(templateManager, {
			FRESH_PLANNING_MODE: true,
			PLANNER: 'codex',
			REVIEWER: 'none',
		})

		expect(prompt).toContain('You are the primary planner for this session.')
		expect(prompt).toContain('issue_management')
		expect(prompt).not.toContain('Task(')
		expect(prompt).not.toContain('AskUserQuestion(')
	})
})
