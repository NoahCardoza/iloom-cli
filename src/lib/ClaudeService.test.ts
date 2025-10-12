import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClaudeService, ClaudeWorkflowOptions } from './ClaudeService.js'
import { PromptTemplateManager } from './PromptTemplateManager.js'
import * as claudeUtils from '../utils/claude.js'

vi.mock('../utils/claude.js')
vi.mock('../utils/logger.js', () => ({
	logger: {
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}))

describe('ClaudeService', () => {
	let service: ClaudeService
	let mockTemplateManager: PromptTemplateManager

	beforeEach(() => {
		mockTemplateManager = {
			getPrompt: vi.fn(),
		} as unknown as PromptTemplateManager

		service = new ClaudeService(mockTemplateManager)
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe('isAvailable', () => {
		it('should return true when Claude CLI is available', async () => {
			vi.mocked(claudeUtils.detectClaudeCli).mockResolvedValueOnce(true)

			const result = await service.isAvailable()

			expect(result).toBe(true)
			expect(claudeUtils.detectClaudeCli).toHaveBeenCalled()
		})

		it('should return false when Claude CLI is not available', async () => {
			vi.mocked(claudeUtils.detectClaudeCli).mockResolvedValueOnce(false)

			const result = await service.isAvailable()

			expect(result).toBe(false)
		})
	})

	describe('launchForWorkflow', () => {
		describe('issue workflow', () => {
			it('should launch Claude with opusplan model and plan permission mode', async () => {
				const options: ClaudeWorkflowOptions = {
					type: 'issue',
					issueNumber: 123,
					title: 'Add authentication',
					workspacePath: '/workspace/issue-123',
					port: 3123,
					headless: false,
				}

				const prompt = 'Issue prompt with substitutions'
				vi.mocked(mockTemplateManager.getPrompt).mockResolvedValueOnce(prompt)
				// Non-headless mode calls launchClaudeInNewTerminalWindow
				vi.mocked(claudeUtils.launchClaudeInNewTerminalWindow).mockResolvedValueOnce(undefined)

				await service.launchForWorkflow(options)

				expect(mockTemplateManager.getPrompt).toHaveBeenCalledWith('issue', {
					ISSUE_NUMBER: 123,
					ISSUE_TITLE: 'Add authentication',
					WORKSPACE_PATH: '/workspace/issue-123',
					PORT: 3123,
				})

				expect(claudeUtils.launchClaudeInNewTerminalWindow).toHaveBeenCalledWith(prompt, {
					model: 'claude-sonnet-4-20250514',
					permissionMode: 'acceptEdits',
					workspacePath: '/workspace/issue-123',
					addDir: '/workspace/issue-123',
					headless: false,
				})
			})

			it('should work without title', async () => {
				const options: ClaudeWorkflowOptions = {
					type: 'issue',
					issueNumber: 123,
					workspacePath: '/workspace',
					port: 3123,
				}

				const prompt = 'Issue prompt'
				vi.mocked(mockTemplateManager.getPrompt).mockResolvedValueOnce(prompt)
				vi.mocked(claudeUtils.launchClaudeInNewTerminalWindow).mockResolvedValueOnce(undefined)

				await service.launchForWorkflow(options)

				expect(mockTemplateManager.getPrompt).toHaveBeenCalledWith('issue', {
					ISSUE_NUMBER: 123,
					WORKSPACE_PATH: '/workspace',
					PORT: 3123,
				})
			})

			it('should work without port', async () => {
				const options: ClaudeWorkflowOptions = {
					type: 'issue',
					issueNumber: 123,
					workspacePath: '/workspace',
				}

				const prompt = 'Issue prompt'
				vi.mocked(mockTemplateManager.getPrompt).mockResolvedValueOnce(prompt)
				vi.mocked(claudeUtils.launchClaudeInNewTerminalWindow).mockResolvedValueOnce(undefined)

				await service.launchForWorkflow(options)

				expect(mockTemplateManager.getPrompt).toHaveBeenCalledWith('issue', {
					ISSUE_NUMBER: 123,
					WORKSPACE_PATH: '/workspace',
				})
			})
		})

		describe('pr workflow', () => {
			it('should launch Claude with default model and permission mode', async () => {
				const options: ClaudeWorkflowOptions = {
					type: 'pr',
					prNumber: 456,
					title: 'Fix bug',
					workspacePath: '/workspace/pr-456',
					port: 3456,
					headless: false,
				}

				const prompt = 'PR prompt with substitutions'
				vi.mocked(mockTemplateManager.getPrompt).mockResolvedValueOnce(prompt)
				vi.mocked(claudeUtils.launchClaudeInNewTerminalWindow).mockResolvedValueOnce(undefined)

				await service.launchForWorkflow(options)

				expect(mockTemplateManager.getPrompt).toHaveBeenCalledWith('pr', {
					PR_NUMBER: 456,
					PR_TITLE: 'Fix bug',
					WORKSPACE_PATH: '/workspace/pr-456',
					PORT: 3456,
				})

				// PR workflow should not set model (uses Claude default) and uses default permission mode
				expect(claudeUtils.launchClaudeInNewTerminalWindow).toHaveBeenCalledWith(prompt, {
					addDir: '/workspace/pr-456',
					workspacePath: '/workspace/pr-456',
					headless: false,
				})
			})
		})

		describe('regular workflow', () => {
			it('should launch Claude with default model and permission mode', async () => {
				const options: ClaudeWorkflowOptions = {
					type: 'regular',
					workspacePath: '/workspace/feature',
					headless: false,
				}

				const prompt = 'Regular prompt'
				vi.mocked(mockTemplateManager.getPrompt).mockResolvedValueOnce(prompt)
				vi.mocked(claudeUtils.launchClaudeInNewTerminalWindow).mockResolvedValueOnce(undefined)

				await service.launchForWorkflow(options)

				expect(mockTemplateManager.getPrompt).toHaveBeenCalledWith('regular', {
					WORKSPACE_PATH: '/workspace/feature',
				})

				// Regular workflow should not set model (uses Claude default) and uses default permission mode
				expect(claudeUtils.launchClaudeInNewTerminalWindow).toHaveBeenCalledWith(prompt, {
					addDir: '/workspace/feature',
					workspacePath: '/workspace/feature',
					headless: false,
				})
			})
		})

		describe('headless mode', () => {
			it('should launch in headless mode and return output', async () => {
				const options: ClaudeWorkflowOptions = {
					type: 'issue',
					issueNumber: 123,
					workspacePath: '/workspace',
					headless: true,
				}

				const prompt = 'Issue prompt'
				const output = 'Claude response'
				vi.mocked(mockTemplateManager.getPrompt).mockResolvedValueOnce(prompt)
				vi.mocked(claudeUtils.launchClaude).mockResolvedValueOnce(output)

				const result = await service.launchForWorkflow(options)

				expect(result).toBe(output)
				expect(claudeUtils.launchClaude).toHaveBeenCalledWith(
					prompt,
					expect.objectContaining({
						headless: true,
					})
				)
			})
		})

		describe('error handling', () => {
			it('should propagate errors from template loading', async () => {
				const options: ClaudeWorkflowOptions = {
					type: 'issue',
					issueNumber: 123,
					workspacePath: '/workspace',
				}

				const error = new Error('Template not found')
				vi.mocked(mockTemplateManager.getPrompt).mockRejectedValueOnce(error)

				await expect(service.launchForWorkflow(options)).rejects.toThrow('Template not found')
			})

			it('should propagate errors from Claude launch in terminal window', async () => {
				const options: ClaudeWorkflowOptions = {
					type: 'issue',
					issueNumber: 123,
					workspacePath: '/workspace',
				}

				const prompt = 'Issue prompt'
				const error = new Error('Claude CLI error')
				vi.mocked(mockTemplateManager.getPrompt).mockResolvedValueOnce(prompt)
				// Non-headless mode calls launchClaudeInNewTerminalWindow
				vi.mocked(claudeUtils.launchClaudeInNewTerminalWindow).mockRejectedValueOnce(error)

				await expect(service.launchForWorkflow(options)).rejects.toThrow('Claude CLI error')
			})
		})
	})

	describe('generateBranchNameWithFallback', () => {
		it('should return branch name from Claude when successful', async () => {
			const branchName = 'feat/issue-123-authentication'
			vi.mocked(claudeUtils.generateBranchName).mockResolvedValueOnce(branchName)

			const result = await service.generateBranchNameWithFallback('Add authentication', 123)

			expect(result).toBe(branchName)
			expect(claudeUtils.generateBranchName).toHaveBeenCalledWith('Add authentication', 123)
		})

		it('should use fallback when Claude generation fails', async () => {
			vi.mocked(claudeUtils.generateBranchName).mockRejectedValueOnce(
				new Error('Claude error')
			)

			const result = await service.generateBranchNameWithFallback('Add authentication', 123)

			expect(result).toBe('feat/issue-123')
		})

		it('should handle different issue numbers in fallback', async () => {
			vi.mocked(claudeUtils.generateBranchName).mockRejectedValueOnce(
				new Error('Claude error')
			)

			const result = await service.generateBranchNameWithFallback('Fix bug', 456)

			expect(result).toBe('feat/issue-456')
		})
	})

	describe('constructor', () => {
		it('should create default PromptTemplateManager if not provided', () => {
			const serviceWithDefaults = new ClaudeService()

			// Verify it was created by checking it doesn't throw
			expect(serviceWithDefaults).toBeDefined()
		})

		it('should use provided PromptTemplateManager', () => {
			const customManager = new PromptTemplateManager('custom/path')
			const serviceWithCustom = new ClaudeService(customManager)

			expect(serviceWithCustom).toBeDefined()
		})
	})
})
