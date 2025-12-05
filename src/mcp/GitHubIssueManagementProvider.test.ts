import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GitHubIssueManagementProvider, extractNumericIdFromUrl } from './GitHubIssueManagementProvider.js'

// Mock the github utils
vi.mock('../utils/github.js', () => ({
	executeGhCommand: vi.fn(),
	createIssueComment: vi.fn(),
	updateIssueComment: vi.fn(),
	createPRComment: vi.fn(),
}))

import { executeGhCommand } from '../utils/github.js'

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
})
