import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PlanCommand } from './plan.js'
import type { PromptTemplateManager } from '../lib/PromptTemplateManager.js'
import * as claudeUtils from '../utils/claude.js'
import * as mcpUtils from '../utils/mcp.js'

// Mock dependencies
vi.mock('../utils/claude.js')
vi.mock('../utils/mcp.js')
vi.mock('../lib/SettingsManager.js', () => ({
	SettingsManager: vi.fn(() => ({
		loadSettings: vi.fn().mockResolvedValue(null),
		getPlanModel: vi.fn().mockReturnValue('opus'),
	})),
}))
vi.mock('../lib/IssueTrackerFactory.js', () => ({
	IssueTrackerFactory: {
		getProviderName: vi.fn().mockReturnValue('github'),
	},
}))
vi.mock('../utils/logger.js', () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		success: vi.fn(),
	},
}))

describe('PlanCommand', () => {
	let command: PlanCommand
	let mockTemplateManager: PromptTemplateManager

	beforeEach(() => {
		// Create mock template manager
		mockTemplateManager = {
			getPrompt: vi.fn().mockResolvedValue('mocked plan prompt content'),
		} as unknown as PromptTemplateManager

		// Create command with mocked dependencies
		command = new PlanCommand(mockTemplateManager)

		// Setup default mocks
		vi.mocked(claudeUtils.detectClaudeCli).mockResolvedValue(true)
		vi.mocked(claudeUtils.launchClaude).mockResolvedValue(undefined)
		vi.mocked(mcpUtils.generateIssueManagementMcpConfig).mockResolvedValue([
			{ mcpServers: { issue_management: {} } },
		])
	})

	describe('VS Code mode detection', () => {
		it('should pass IS_VSCODE_MODE: true when ILOOM_VSCODE=1', async () => {
			// Set ILOOM_VSCODE environment variable
			const originalEnv = process.env.ILOOM_VSCODE
			process.env.ILOOM_VSCODE = '1'

			try {
				await command.execute()

				// Verify template manager was called with IS_VSCODE_MODE: true
				expect(mockTemplateManager.getPrompt).toHaveBeenCalledWith(
					'plan',
					expect.objectContaining({
						IS_VSCODE_MODE: true,
					})
				)
			} finally {
				// Restore original environment
				if (originalEnv === undefined) {
					delete process.env.ILOOM_VSCODE
				} else {
					process.env.ILOOM_VSCODE = originalEnv
				}
			}
		})

		it('should pass IS_VSCODE_MODE: false when ILOOM_VSCODE is not set', async () => {
			// Ensure ILOOM_VSCODE is not set
			const originalEnv = process.env.ILOOM_VSCODE
			delete process.env.ILOOM_VSCODE

			try {
				await command.execute()

				// Verify template manager was called with IS_VSCODE_MODE: false
				expect(mockTemplateManager.getPrompt).toHaveBeenCalledWith(
					'plan',
					expect.objectContaining({
						IS_VSCODE_MODE: false,
					})
				)
			} finally {
				// Restore original environment
				if (originalEnv !== undefined) {
					process.env.ILOOM_VSCODE = originalEnv
				}
			}
		})

		it('should pass IS_VSCODE_MODE: false when ILOOM_VSCODE is empty string', async () => {
			// Set ILOOM_VSCODE to empty string
			const originalEnv = process.env.ILOOM_VSCODE
			process.env.ILOOM_VSCODE = ''

			try {
				await command.execute()

				// Verify template manager was called with IS_VSCODE_MODE: false
				expect(mockTemplateManager.getPrompt).toHaveBeenCalledWith(
					'plan',
					expect.objectContaining({
						IS_VSCODE_MODE: false,
					})
				)
			} finally {
				// Restore original environment
				if (originalEnv === undefined) {
					delete process.env.ILOOM_VSCODE
				} else {
					process.env.ILOOM_VSCODE = originalEnv
				}
			}
		})

		it('should pass IS_VSCODE_MODE: false when ILOOM_VSCODE is 0', async () => {
			// Set ILOOM_VSCODE to '0'
			const originalEnv = process.env.ILOOM_VSCODE
			process.env.ILOOM_VSCODE = '0'

			try {
				await command.execute()

				// Verify template manager was called with IS_VSCODE_MODE: false
				expect(mockTemplateManager.getPrompt).toHaveBeenCalledWith(
					'plan',
					expect.objectContaining({
						IS_VSCODE_MODE: false,
					})
				)
			} finally {
				// Restore original environment
				if (originalEnv === undefined) {
					delete process.env.ILOOM_VSCODE
				} else {
					process.env.ILOOM_VSCODE = originalEnv
				}
			}
		})
	})

	describe('Claude CLI availability', () => {
		it('should throw error when Claude CLI is not available', async () => {
			vi.mocked(claudeUtils.detectClaudeCli).mockResolvedValue(false)

			await expect(command.execute()).rejects.toThrow(
				'Claude Code CLI is required for planning sessions'
			)
		})

		it('should proceed when Claude CLI is available', async () => {
			vi.mocked(claudeUtils.detectClaudeCli).mockResolvedValue(true)

			await command.execute()

			expect(claudeUtils.launchClaude).toHaveBeenCalled()
		})
	})

	describe('MCP config generation', () => {
		it('should throw error when MCP config generation fails', async () => {
			vi.mocked(mcpUtils.generateIssueManagementMcpConfig).mockRejectedValue(
				new Error('No git remote configured')
			)

			await expect(command.execute()).rejects.toThrow(
				'Cannot start planning session: No git remote configured'
			)
		})
	})

	describe('Claude launch options', () => {
		it('should pass appendSystemPrompt with template content', async () => {
			const mockPromptContent = 'Test architect prompt content'
			vi.mocked(mockTemplateManager.getPrompt).mockResolvedValue(mockPromptContent)

			await command.execute()

			expect(claudeUtils.launchClaude).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					appendSystemPrompt: mockPromptContent,
				})
			)
		})

		it('should pass optional prompt as initial message', async () => {
			const testPrompt = 'Help me plan a new feature'

			await command.execute(testPrompt)

			expect(claudeUtils.launchClaude).toHaveBeenCalledWith(
				testPrompt,
				expect.any(Object)
			)
		})

		it('should use default message when no prompt provided', async () => {
			await command.execute()

			expect(claudeUtils.launchClaude).toHaveBeenCalledWith(
				'Help me plan a feature or decompose work into issues.',
				expect.any(Object)
			)
		})

		it('should pass allowedTools configuration', async () => {
			await command.execute()

			expect(claudeUtils.launchClaude).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					allowedTools: expect.arrayContaining([
						'mcp__issue_management__create_issue',
						'mcp__issue_management__create_child_issue',
						'mcp__issue_management__get_issue',
						'Read',
						'Glob',
						'Grep',
					]),
				})
			)
		})
	})

	describe('yolo mode', () => {
		it('should add bypassPermissions when yolo is true', async () => {
			await command.execute('test prompt', undefined, true)

			expect(claudeUtils.launchClaude).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					permissionMode: 'bypassPermissions',
				})
			)
		})

		it('should not add bypassPermissions when yolo is false', async () => {
			await command.execute(undefined, undefined, false)

			expect(claudeUtils.launchClaude).toHaveBeenCalledWith(
				expect.any(String),
				expect.not.objectContaining({
					permissionMode: 'bypassPermissions',
				})
			)
		})

		it('should structure prompt with AUTONOMOUS MODE and TOPIC sections when yolo is true', async () => {
			const testPrompt = 'Help me plan a feature'

			await command.execute(testPrompt, undefined, true)

			expect(claudeUtils.launchClaude).toHaveBeenCalledWith(
				expect.stringContaining('[AUTONOMOUS MODE]'),
				expect.any(Object)
			)
			expect(claudeUtils.launchClaude).toHaveBeenCalledWith(
				expect.stringContaining('[TOPIC]'),
				expect.any(Object)
			)
			expect(claudeUtils.launchClaude).toHaveBeenCalledWith(
				expect.stringContaining(testPrompt),
				expect.any(Object)
			)
		})

		it('should throw error when yolo is true but no prompt provided', async () => {
			await expect(command.execute(undefined, undefined, true)).rejects.toThrow(
				'--yolo requires a prompt or issue identifier'
			)
		})

		it('should not modify prompt when yolo is false', async () => {
			const testPrompt = 'Help me plan a feature'

			await command.execute(testPrompt, undefined, false)

			expect(claudeUtils.launchClaude).toHaveBeenCalledWith(
				testPrompt,
				expect.any(Object)
			)
		})

		it('should log warning when yolo mode is enabled', async () => {
			const { logger } = await import('../utils/logger.js')

			await command.execute('test prompt', undefined, true)

			expect(logger.warn).toHaveBeenCalledWith(
				'⚠️  YOLO mode enabled - Claude will skip permission prompts and proceed autonomously'
			)
		})
	})
})
