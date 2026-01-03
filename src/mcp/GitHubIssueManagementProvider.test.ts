import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GitHubIssueManagementProvider, extractNumericIdFromUrl } from './GitHubIssueManagementProvider.js'

// Mock the github utils
vi.mock('../utils/github.js', () => ({
	executeGhCommand: vi.fn(),
	createIssueComment: vi.fn(),
	updateIssueComment: vi.fn(),
	createPRComment: vi.fn(),
	createIssue: vi.fn(),
}))

import { executeGhCommand, createIssue } from '../utils/github.js'

describe('extractNumericIdFromUrl', () => {
	it('extracts numeric ID from valid GitHub issue comment URL', () => {
		const url = 'https://github.com/owner/repo/issues/123#issuecomment-3615239386'
		expect(extractNumericIdFromUrl(url)).toBe('3615239386')
	})

	it('extracts numeric ID from valid GitHub PR comment URL', () => {
		const url = 'https://github.com/owner/repo/pull/456#issuecomment-9876543210'
		expect(extractNumericIdFromUrl(url)).toBe('9876543210')
	})

	it('throws error when URL has no issuecomment fragment', () => {
		const url = 'https://github.com/owner/repo/issues/123'
		expect(() => extractNumericIdFromUrl(url)).toThrow('Cannot extract comment ID from URL')
	})

	it('throws error when URL has malformed issuecomment fragment', () => {
		const url = 'https://github.com/owner/repo/issues/123#issuecomment-'
		expect(() => extractNumericIdFromUrl(url)).toThrow('Cannot extract comment ID from URL')
	})

	it('throws error when issuecomment fragment has non-numeric ID', () => {
		const url = 'https://github.com/owner/repo/issues/123#issuecomment-abc123'
		expect(() => extractNumericIdFromUrl(url)).toThrow('Cannot extract comment ID from URL')
	})
})

describe('GitHubIssueManagementProvider', () => {
	let provider: GitHubIssueManagementProvider

	beforeEach(() => {
		provider = new GitHubIssueManagementProvider()
	})

	describe('issuePrefix', () => {
		it('should return "#" for GitHub provider', () => {
			expect(provider.issuePrefix).toBe('#')
		})
	})

	describe('getIssue', () => {
		it('returns comments with numeric IDs extracted from URLs', async () => {
			const mockResponse = {
				number: 123,
				title: 'Test Issue',
				body: 'Issue body',
				state: 'OPEN',
				url: 'https://github.com/owner/repo/issues/123',
				author: { login: 'testuser' },
				comments: [
					{
						id: 'IC_kwDOPvp_cc7Xe_ri', // GraphQL node ID (should be ignored)
						author: { login: 'commenter1' },
						body: 'First comment',
						createdAt: '2025-01-01T00:00:00Z',
						url: 'https://github.com/owner/repo/issues/123#issuecomment-3615239386',
					},
					{
						id: 'IC_kwDOPvp_cc7Xe_rj', // GraphQL node ID (should be ignored)
						author: { login: 'commenter2' },
						body: 'Second comment',
						createdAt: '2025-01-02T00:00:00Z',
						url: 'https://github.com/owner/repo/issues/123#issuecomment-3615239387',
					},
				],
			}

			vi.mocked(executeGhCommand).mockResolvedValueOnce(mockResponse)

			const result = await provider.getIssue({ number: '123' })

			expect(result.comments).toHaveLength(2)
			// Verify numeric IDs are extracted from URLs, not GraphQL node IDs
			expect(result.comments![0].id).toBe('3615239386')
			expect(result.comments![1].id).toBe('3615239387')
		})

		it('handles issues without comments', async () => {
			const mockResponse = {
				number: 123,
				title: 'Test Issue',
				body: 'Issue body',
				state: 'OPEN',
				url: 'https://github.com/owner/repo/issues/123',
				author: { login: 'testuser' },
			}

			vi.mocked(executeGhCommand).mockResolvedValueOnce(mockResponse)

			const result = await provider.getIssue({ number: '123', includeComments: false })

			expect(result.comments).toBeUndefined()
		})

		it('throws error when comment URL is missing issuecomment fragment', async () => {
			const mockResponse = {
				number: 123,
				title: 'Test Issue',
				body: 'Issue body',
				state: 'OPEN',
				url: 'https://github.com/owner/repo/issues/123',
				author: { login: 'testuser' },
				comments: [
					{
						id: 'IC_kwDOPvp_cc7Xe_ri',
						author: { login: 'commenter1' },
						body: 'Bad comment',
						createdAt: '2025-01-01T00:00:00Z',
						url: 'https://github.com/owner/repo/issues/123', // Missing #issuecomment fragment
					},
				],
			}

			vi.mocked(executeGhCommand).mockResolvedValueOnce(mockResponse)

			await expect(provider.getIssue({ number: '123' })).rejects.toThrow(
				'Cannot extract comment ID from URL'
			)
		})
	})

	describe('createIssue', () => {
		it('should create an issue with title and body', async () => {
			vi.mocked(createIssue).mockResolvedValueOnce({
				number: 456,
				url: 'https://github.com/owner/repo/issues/456',
			})

			const result = await provider.createIssue({
				title: 'New Issue',
				body: 'Issue description',
			})

			expect(createIssue).toHaveBeenCalledWith('New Issue', 'Issue description', { labels: undefined })
			expect(result.id).toBe('456')
			expect(result.url).toBe('https://github.com/owner/repo/issues/456')
			expect(result.number).toBe(456)
		})

		it('should create an issue with optional labels', async () => {
			vi.mocked(createIssue).mockResolvedValueOnce({
				number: 789,
				url: 'https://github.com/owner/repo/issues/789',
			})

			const result = await provider.createIssue({
				title: 'Labeled Issue',
				body: 'Issue with labels',
				labels: ['bug', 'priority:high'],
			})

			expect(createIssue).toHaveBeenCalledWith('Labeled Issue', 'Issue with labels', {
				labels: ['bug', 'priority:high'],
			})
			expect(result.id).toBe('789')
			expect(result.number).toBe(789)
		})

		it('should ignore teamKey parameter', async () => {
			vi.mocked(createIssue).mockResolvedValueOnce({
				number: 101,
				url: 'https://github.com/owner/repo/issues/101',
			})

			const result = await provider.createIssue({
				title: 'Issue with teamKey',
				body: 'Body',
				teamKey: 'ENG', // Should be ignored for GitHub
			})

			expect(createIssue).toHaveBeenCalledWith('Issue with teamKey', 'Body', { labels: undefined })
			expect(result.id).toBe('101')
		})
	})
})
