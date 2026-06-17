import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPlanningRuntime, ClaudePlanningRuntime, CodexPlanningRuntime } from './plan-runtime.js'
import type { PromptTemplateManager } from '../lib/PromptTemplateManager.js'
import * as claudeUtils from '../utils/claude.js'
import * as codexUtils from '../utils/codex.js'

vi.mock('../utils/claude.js')
vi.mock('../utils/codex.js')

describe('plan runtime factory', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(claudeUtils.detectClaudeCli).mockResolvedValue(true)
		vi.mocked(codexUtils.detectCodexCli).mockResolvedValue(true)
		vi.mocked(claudeUtils.launchClaude).mockResolvedValue(undefined)
		vi.mocked(codexUtils.launchCodex).mockResolvedValue(undefined)
	})

	it('returns Claude runtime for claude planner', () => {
		expect(createPlanningRuntime('claude')).toBeInstanceOf(ClaudePlanningRuntime)
	})

	it('returns Claude runtime for gemini planner', () => {
		expect(createPlanningRuntime('gemini')).toBeInstanceOf(ClaudePlanningRuntime)
	})

	it('returns Codex runtime for codex planner', () => {
		expect(createPlanningRuntime('codex')).toBeInstanceOf(CodexPlanningRuntime)
	})
})

describe('CodexPlanningRuntime', () => {
	const runtime = new CodexPlanningRuntime()

	it('rejects non-none reviewers', () => {
		expect(() =>
			runtime.validate({
				reviewer: 'claude',
			})
		).toThrow('Codex planning does not support reviewers yet')
	})

	it('rejects auto-swarm', () => {
		expect(() =>
			runtime.validate({
				reviewer: 'none',
				autoSwarm: true,
			})
		).toThrow('Codex planning does not support --auto-swarm yet')
	})

	it('rejects Claude shorthand models passed explicitly', () => {
		expect(() =>
			runtime.validate({
				reviewer: 'none',
				model: 'sonnet',
				modelProvidedByUser: true,
			})
		).toThrow('Codex planning does not accept Claude model')
	})

	it('rejects Claude 1M shorthand models passed explicitly', () => {
		expect(() =>
			runtime.validate({
				reviewer: 'none',
				model: 'opus[1m]',
				modelProvidedByUser: true,
			})
		).toThrow('Codex planning does not accept Claude model')
	})

	it('rejects full Claude model IDs passed explicitly', () => {
		expect(() =>
			runtime.validate({
				reviewer: 'none',
				model: 'claude-opus-4-6[1m]',
				modelProvidedByUser: true,
			})
		).toThrow('Codex planning does not accept Claude model')
	})

	it('accepts Codex model names passed explicitly', () => {
		expect(() =>
			runtime.validate({
				reviewer: 'none',
				model: 'gpt-5.2-codex',
				modelProvidedByUser: true,
			})
		).not.toThrow()
	})

	it('loads the Codex-specific planning prompt', async () => {
		const templateManager = {
			getPrompt: vi.fn().mockResolvedValue('codex plan prompt'),
		} as unknown as PromptTemplateManager

		const result = await runtime.getPrompt(templateManager, {
			FRESH_PLANNING_MODE: true,
		})

		expect(result).toBe('codex plan prompt')
		expect(templateManager.getPrompt).toHaveBeenCalledWith(
			'plan-codex',
			expect.objectContaining({
				FRESH_PLANNING_MODE: true,
			})
		)
	})

	it('launches Codex in headless mode with full-auto settings', async () => {
		vi.mocked(codexUtils.launchCodex).mockResolvedValueOnce('planned output')

		const result = await runtime.launch('Plan this', {
			model: 'opus',
			modelProvidedByUser: false,
			yolo: true,
			printOptions: { print: true, jsonStream: true },
			appendSystemPrompt: 'System prompt',
			mcpConfig: [{ mcpServers: { issue_management: {} } }],
			workingDirectory: '/repo',
			additionalWritableDirectories: ['/tmp'],
		})

		expect(result).toBe('planned output')
		expect(codexUtils.launchCodex).toHaveBeenCalledWith(
			'Plan this',
			expect.objectContaining({
				headless: true,
				fullAuto: true,
				sandbox: 'workspace-write',
				jsonMode: 'stream',
				passthroughStdout: true,
				workingDirectory: '/repo',
				addDirs: ['/tmp'],
			})
		)
	})
})

describe('ClaudePlanningRuntime', () => {
	const runtime = new ClaudePlanningRuntime()

	it('accepts Claude shorthand and full Claude model names', () => {
		for (const model of ['opus', 'sonnet[1m]', 'claude-opus-4-6[1m]']) {
			expect(() =>
				runtime.validate({
					reviewer: 'none',
					model,
					modelProvidedByUser: true,
				})
			).not.toThrow()
		}
	})

	it('rejects Codex-shaped model names passed explicitly', () => {
		expect(() =>
			runtime.validate({
				planner: 'claude',
				reviewer: 'none',
				model: 'gpt-5.2-codex',
				modelProvidedByUser: true,
			})
		).toThrow('Claude planning only accepts Claude model names')
	})

	it('preserves existing Gemini planner model pass-through behavior', () => {
		expect(() =>
			runtime.validate({
				planner: 'gemini',
				reviewer: 'none',
				model: 'gemini-3-pro-preview',
				modelProvidedByUser: true,
			})
		).not.toThrow()
	})
})
