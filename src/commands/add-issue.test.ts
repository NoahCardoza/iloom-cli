import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AddIssueCommand } from './add-issue.js'
import { IssueEnhancementService } from '../lib/IssueEnhancementService.js'
import type { GitHubService } from '../lib/GitHubService.js'
import type { AgentManager } from '../lib/AgentManager.js'
import type { SettingsManager } from '../lib/SettingsManager.js'

// Mock dependencies
vi.mock('../lib/IssueEnhancementService.js')
vi.mock('../lib/SettingsManager.js', () => {
	return {
		SettingsManager: class MockSettingsManager {
			async loadSettings() {
				return {}
			}
		},
	}
})

// Mock remote utilities
vi.mock('../utils/remote.js', () => ({
	hasMultipleRemotes: vi.fn().mockResolvedValue(false),
	getConfiguredRepoFromSettings: vi.fn().mockResolvedValue('owner/repo'),
	parseGitRemotes: vi.fn().mockResolvedValue([]),
	validateConfiguredRemote: vi.fn().mockResolvedValue(undefined),
}))

// Mock the logger to prevent console output during tests
vi.mock('../utils/logger.js', () => ({
	logger: {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
		success: vi.fn(),
	},
}))

describe('AddIssueCommand', () => {
	let command: AddIssueCommand
	let mockEnhancementService: IssueEnhancementService

	beforeEach(() => {
		const mockIssueTracker = { providerName: 'github' } as GitHubService
		mockEnhancementService = new IssueEnhancementService(
			mockIssueTracker,
			{} as AgentManager,
			{} as SettingsManager
		)
		// Override the issueTracker getter to ensure it returns our mock
		Object.defineProperty(mockEnhancementService, 'issueTracker', {
			get: () => mockIssueTracker,
		})
		command = new AddIssueCommand(mockEnhancementService)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe('execute', () => {
		const validDescription = 'This is a valid description that has more than thirty characters and multiple spaces'

		describe('input validation', () => {
			it('should throw error when description is empty or missing', async () => {
				await expect(
					command.execute({ description: '', options: {} })
				).rejects.toThrow('Description is required and must be more than 30 characters with at least 3 words')
			})

			it('should throw error when description is too short (<30 chars)', async () => {
				vi.mocked(mockEnhancementService.validateDescription).mockReturnValue(false)

				await expect(
					command.execute({ description: 'Short description', options: {} })
				).rejects.toThrow('Description is required and must be more than 30 characters with at least 3 words')
			})

			it('should throw error when description has insufficient spaces (<=2)', async () => {
				vi.mocked(mockEnhancementService.validateDescription).mockReturnValue(false)

				await expect(
					command.execute({ description: 'This has twospacesbutmorethanthirtycharactersintotal', options: {} })
				).rejects.toThrow('Description is required and must be more than 30 characters with at least 3 words')
			})

			it('should accept valid descriptions (>30 chars AND >2 spaces)', async () => {
				vi.mocked(mockEnhancementService.validateDescription).mockReturnValue(true)
				vi.mocked(mockEnhancementService.enhanceDescription).mockResolvedValue('Enhanced description')
				vi.mocked(mockEnhancementService.createEnhancedIssue).mockResolvedValue({
					number: 123,
					url: 'https://github.com/owner/repo/issues/123',
				})
				vi.mocked(mockEnhancementService.waitForReviewAndOpen).mockResolvedValue(undefined)

				await expect(
					command.execute({ description: validDescription, options: {} })
				).resolves.toBe(123)
			})
		})

		describe('enhancement workflow', () => {
			beforeEach(() => {
				vi.mocked(mockEnhancementService.validateDescription).mockReturnValue(true)
			})

			it('should enhance description using IssueEnhancementService', async () => {
				vi.mocked(mockEnhancementService.enhanceDescription).mockResolvedValue('Enhanced description')
				vi.mocked(mockEnhancementService.createEnhancedIssue).mockResolvedValue({
					number: 123,
					url: 'https://github.com/owner/repo/issues/123',
				})
				vi.mocked(mockEnhancementService.waitForReviewAndOpen).mockResolvedValue(undefined)

				await command.execute({ description: validDescription, options: {} })

				expect(mockEnhancementService.enhanceDescription).toHaveBeenCalledWith(validDescription)
			})

			it('should use original description as title and enhanced version as body', async () => {
				const enhancedDescription = 'This is the enhanced description with more details and structure'
				vi.mocked(mockEnhancementService.enhanceDescription).mockResolvedValue(enhancedDescription)
				vi.mocked(mockEnhancementService.createEnhancedIssue).mockResolvedValue({
					number: 123,
					url: 'https://github.com/owner/repo/issues/123',
				})
				vi.mocked(mockEnhancementService.waitForReviewAndOpen).mockResolvedValue(undefined)

				await command.execute({ description: validDescription, options: {} })

				expect(mockEnhancementService.createEnhancedIssue).toHaveBeenCalledWith(
					validDescription,
					enhancedDescription,
					undefined
				)
			})

			it('should handle enhancement failures gracefully', async () => {
				// Enhancement returns original description on failure
				vi.mocked(mockEnhancementService.enhanceDescription).mockResolvedValue(validDescription)
				vi.mocked(mockEnhancementService.createEnhancedIssue).mockResolvedValue({
					number: 123,
					url: 'https://github.com/owner/repo/issues/123',
				})
				vi.mocked(mockEnhancementService.waitForReviewAndOpen).mockResolvedValue(undefined)

				await expect(
					command.execute({ description: validDescription, options: {} })
				).resolves.toBe(123)
			})
		})

		describe('GitHub integration', () => {
			beforeEach(() => {
				vi.mocked(mockEnhancementService.validateDescription).mockReturnValue(true)
				vi.mocked(mockEnhancementService.enhanceDescription).mockResolvedValue('Enhanced description')
			})

			it('should call createEnhancedIssue with correct parameters', async () => {
				vi.mocked(mockEnhancementService.createEnhancedIssue).mockResolvedValue({
					number: 456,
					url: 'https://github.com/owner/repo/issues/456',
				})
				vi.mocked(mockEnhancementService.waitForReviewAndOpen).mockResolvedValue(undefined)

				await command.execute({ description: validDescription, options: {} })

				expect(mockEnhancementService.createEnhancedIssue).toHaveBeenCalledTimes(1)
			})

			it('should return the created issue number', async () => {
				const expectedIssueNumber = 789
				vi.mocked(mockEnhancementService.createEnhancedIssue).mockResolvedValue({
					number: expectedIssueNumber,
					url: 'https://github.com/owner/repo/issues/789',
				})
				vi.mocked(mockEnhancementService.waitForReviewAndOpen).mockResolvedValue(undefined)

				const result = await command.execute({ description: validDescription, options: {} })

				expect(result).toBe(expectedIssueNumber)
			})

			it('should propagate errors from createEnhancedIssue', async () => {
				vi.mocked(mockEnhancementService.createEnhancedIssue).mockRejectedValue(
					new Error('GitHub API error')
				)

				await expect(
					command.execute({ description: validDescription, options: {} })
				).rejects.toThrow('GitHub API error')
			})
		})

		describe('browser interaction', () => {
			beforeEach(() => {
				vi.mocked(mockEnhancementService.validateDescription).mockReturnValue(true)
				vi.mocked(mockEnhancementService.enhanceDescription).mockResolvedValue('Enhanced description')
				vi.mocked(mockEnhancementService.createEnhancedIssue).mockResolvedValue({
					number: 123,
					url: 'https://github.com/owner/repo/issues/123',
				})
			})

			it('should call waitForReviewAndOpen with confirm=false (single keypress)', async () => {
				vi.mocked(mockEnhancementService.waitForReviewAndOpen).mockResolvedValue(undefined)

				await command.execute({ description: validDescription, options: {} })

				// add-issue should use single keypress method (confirm=false is default)
				expect(mockEnhancementService.waitForReviewAndOpen).toHaveBeenCalledWith(123)
				expect(mockEnhancementService.waitForReviewAndOpen).toHaveBeenCalledTimes(1)
			})

			it('should wait for review and open browser', async () => {
				vi.mocked(mockEnhancementService.waitForReviewAndOpen).mockResolvedValue(undefined)

				await command.execute({ description: validDescription, options: {} })

				expect(mockEnhancementService.waitForReviewAndOpen).toHaveBeenCalledWith(123)
			})

			it('should wait for review after issue creation', async () => {
				const calls: string[] = []

				vi.mocked(mockEnhancementService.createEnhancedIssue).mockImplementation(async () => {
					calls.push('create')
					return { number: 123, url: 'https://github.com/owner/repo/issues/123' }
				})

				vi.mocked(mockEnhancementService.waitForReviewAndOpen).mockImplementation(async () => {
					calls.push('review')
				})

				await command.execute({ description: validDescription, options: {} })

				expect(calls).toEqual(['create', 'review'])
			})

			it('should handle browser opening failures gracefully', async () => {
				vi.mocked(mockEnhancementService.waitForReviewAndOpen).mockRejectedValue(
					new Error('Browser opening failed')
				)

				await expect(
					command.execute({ description: validDescription, options: {} })
				).rejects.toThrow('Browser opening failed')
			})
		})

		describe('complete workflow', () => {
			it('should execute full workflow in correct order', async () => {
				const calls: string[] = []

				vi.mocked(mockEnhancementService.validateDescription).mockImplementation(() => {
					calls.push('validate')
					return true
				})

				vi.mocked(mockEnhancementService.enhanceDescription).mockImplementation(async () => {
					calls.push('enhance')
					return 'Enhanced description'
				})

				vi.mocked(mockEnhancementService.createEnhancedIssue).mockImplementation(async () => {
					calls.push('create')
					return { number: 123, url: 'https://github.com/owner/repo/issues/123' }
				})

				vi.mocked(mockEnhancementService.waitForReviewAndOpen).mockImplementation(async () => {
					calls.push('review')
				})

				await command.execute({ description: validDescription, options: {} })

				expect(calls).toEqual(['validate', 'enhance', 'create', 'review'])
			})
		})

		describe('--body flag behavior', () => {
			const preFormattedBody = '## Requirements\n- Item 1\n- Item 2\n\n## Acceptance Criteria\n- Test passes'

			beforeEach(() => {
				vi.mocked(mockEnhancementService.validateDescription).mockReturnValue(true)
				vi.mocked(mockEnhancementService.createEnhancedIssue).mockResolvedValue({
					number: 123,
					url: 'https://github.com/owner/repo/issues/123',
				})
				vi.mocked(mockEnhancementService.waitForReviewAndOpen).mockResolvedValue(undefined)
			})

			it('should skip enhancement when body is provided', async () => {
				vi.mocked(mockEnhancementService.enhanceDescription).mockResolvedValue('Enhanced description')

				await command.execute({
					description: validDescription,
					options: { body: preFormattedBody }
				})

				expect(mockEnhancementService.enhanceDescription).not.toHaveBeenCalled()
			})

			it('should use provided body as issue body directly', async () => {
				await command.execute({
					description: validDescription,
					options: { body: preFormattedBody }
				})

				expect(mockEnhancementService.createEnhancedIssue).toHaveBeenCalledWith(
					validDescription,
					preFormattedBody,
					undefined
				)
			})

			it('should still validate description when body is provided', async () => {
				await command.execute({
					description: validDescription,
					options: { body: preFormattedBody }
				})

				expect(mockEnhancementService.validateDescription).toHaveBeenCalledWith(validDescription)
			})

			it('should call createEnhancedIssue with description as title and body as body', async () => {
				await command.execute({
					description: validDescription,
					options: { body: preFormattedBody }
				})

				expect(mockEnhancementService.createEnhancedIssue).toHaveBeenCalledWith(
					validDescription,
					preFormattedBody,
					undefined
				)
			})

			it('should still call waitForReviewAndOpen when body is provided', async () => {
				await command.execute({
					description: validDescription,
					options: { body: preFormattedBody }
				})

				expect(mockEnhancementService.waitForReviewAndOpen).toHaveBeenCalledWith(123)
			})

			it('should execute workflow without enhance step when body is provided', async () => {
				const calls: string[] = []

				vi.mocked(mockEnhancementService.validateDescription).mockImplementation(() => {
					calls.push('validate')
					return true
				})

				vi.mocked(mockEnhancementService.enhanceDescription).mockImplementation(async () => {
					calls.push('enhance')
					return 'Enhanced description'
				})

				vi.mocked(mockEnhancementService.createEnhancedIssue).mockImplementation(async () => {
					calls.push('create')
					return { number: 123, url: 'https://github.com/owner/repo/issues/123' }
				})

				vi.mocked(mockEnhancementService.waitForReviewAndOpen).mockImplementation(async () => {
					calls.push('review')
				})

				await command.execute({
					description: validDescription,
					options: { body: preFormattedBody }
				})

				// Note: 'enhance' should NOT be in the calls
				expect(calls).toEqual(['validate', 'create', 'review'])
			})
		})
	})
})
