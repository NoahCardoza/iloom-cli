import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AgentManager, type AgentConfig, type AgentConfigs } from './AgentManager.js'
import { readFile, readdir } from 'fs/promises'

vi.mock('fs/promises')
vi.mock('../utils/logger.js', () => ({
	logger: {
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}))

describe('AgentManager', () => {
	let manager: AgentManager

	beforeEach(() => {
		manager = new AgentManager('templates/agents')
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe('loadAgents', () => {
		it('should load all three agent JSON files successfully', async () => {
			// Mock readdir to return the agent filenames
			vi.mocked(readdir).mockResolvedValueOnce([
				'hatchbox-issue-analyzer.json',
				'hatchbox-issue-planner.json',
				'hatchbox-issue-implementer.json',
			] as string[])

			// Mock readFile to return valid JSON for each agent
			const mockAnalyzer: AgentConfig = {
				description: 'Analyzer agent',
				prompt: 'You are an analyzer',
				tools: ['Read', 'Grep'],
				model: 'sonnet',
				color: 'pink',
			}

			const mockPlanner: AgentConfig = {
				description: 'Planner agent',
				prompt: 'You are a planner',
				tools: ['Read', 'Write'],
				model: 'sonnet',
				color: 'blue',
			}

			const mockImplementer: AgentConfig = {
				description: 'Implementer agent',
				prompt: 'You are an implementer',
				tools: ['Edit', 'Bash'],
				model: 'sonnet',
				color: 'green',
			}

			vi.mocked(readFile)
				.mockResolvedValueOnce(JSON.stringify(mockAnalyzer))
				.mockResolvedValueOnce(JSON.stringify(mockPlanner))
				.mockResolvedValueOnce(JSON.stringify(mockImplementer))

			const result = await manager.loadAgents()

			expect(Object.keys(result)).toHaveLength(3)
			expect(result['hatchbox-issue-analyzer']).toEqual(mockAnalyzer)
			expect(result['hatchbox-issue-planner']).toEqual(mockPlanner)
			expect(result['hatchbox-issue-implementer']).toEqual(mockImplementer)
		})

		it('should handle missing agent files gracefully', async () => {
			vi.mocked(readdir).mockResolvedValueOnce([
				'hatchbox-issue-analyzer.json',
			] as string[])
			vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT: no such file'))

			await expect(manager.loadAgents()).rejects.toThrow(
				'Failed to load agent hatchbox-issue-analyzer',
			)
		})

		it('should handle malformed JSON in agent files', async () => {
			vi.mocked(readdir).mockResolvedValueOnce([
				'hatchbox-issue-analyzer.json',
			] as string[])
			vi.mocked(readFile).mockResolvedValueOnce('{ invalid json')

			await expect(manager.loadAgents()).rejects.toThrow(
				'Failed to load agent hatchbox-issue-analyzer',
			)
		})

		it('should validate agent schema - missing required fields', async () => {
			vi.mocked(readdir).mockResolvedValueOnce([
				'test-agent.json',
			] as string[])
			const invalidAgent = {
				description: 'Test',
				// Missing prompt, tools, model
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(invalidAgent))

			await expect(manager.loadAgents()).rejects.toThrow('missing required field')
		})

		it('should validate tools is an array', async () => {
			vi.mocked(readdir).mockResolvedValueOnce([
				'test-agent.json',
			] as string[])
			const invalidAgent = {
				description: 'Test',
				prompt: 'Test prompt',
				tools: 'Read,Write', // String instead of array
				model: 'sonnet',
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(invalidAgent))

			await expect(manager.loadAgents()).rejects.toThrow('tools must be an array')
		})
	})

	describe('formatForCli', () => {
		it('should format agents as object for --agents flag', () => {
			const agents: AgentConfigs = {
				'test-agent': {
					description: 'Test',
					prompt: 'Test prompt',
					tools: ['Read'],
					model: 'sonnet',
					color: 'blue',
				},
			}

			const result = manager.formatForCli(agents)

			expect(result).toEqual(agents)
			expect(typeof result).toBe('object')
		})

		it('should include color field in output', () => {
			const agents: AgentConfigs = {
				'test-agent': {
					description: 'Test',
					prompt: 'Test prompt',
					tools: ['Read'],
					model: 'sonnet',
					color: 'pink',
				},
			}

			const result = manager.formatForCli(agents)

			expect(result['test-agent']).toHaveProperty('color', 'pink')
		})

		it('should preserve tools array structure', () => {
			const agents: AgentConfigs = {
				'test-agent': {
					description: 'Test',
					prompt: 'Test prompt',
					tools: ['Read', 'Write', 'Edit'],
					model: 'sonnet',
				},
			}

			const result = manager.formatForCli(agents)

			expect(Array.isArray(result['test-agent'].tools)).toBe(true)
			expect(result['test-agent'].tools).toHaveLength(3)
		})
	})
})
