import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GitHubIssueManagementProvider, extractNumericIdFromUrl } from './GitHubIssueManagementProvider.js'

// Mock the github utils
vi.mock('../utils/github.js', () => ({
	executeGhCommand: vi.fn(),
	createIssueComment: vi.fn(),
	updateIssueComment: vi.fn(),
	createPRComment: vi.fn(),
	createIssue: vi.fn(),
	getIssueNodeId: vi.fn(),
	addSubIssue: vi.fn(),
}))

import { executeGhCommand, createIssue, getIssueNodeId, addSubIssue } from '../utils/github.js'

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

		it('passes --repo flag when repo parameter is provided', async () => {
			const mockResponse = {
				number: 456,
				title: 'External Issue',
				body: 'Issue from another repo',
				state: 'OPEN',
				url: 'https://github.com/other-owner/other-repo/issues/456',
				author: { login: 'testuser' },
			}

			vi.mocked(executeGhCommand).mockResolvedValueOnce(mockResponse)

			await provider.getIssue({ number: '456', repo: 'other-owner/other-repo', includeComments: false })

			expect(executeGhCommand).toHaveBeenCalledWith([
				'issue',
				'view',
				'456',
				'--json',
				'body,title,labels,assignees,milestone,author,state,number,url',
				'--repo',
				'other-owner/other-repo',
			])
		})

		it('does not pass --repo flag when repo parameter is undefined', async () => {
			const mockResponse = {
				number: 789,
				title: 'Local Issue',
				body: 'Issue from current repo',
				state: 'OPEN',
				url: 'https://github.com/owner/repo/issues/789',
				author: { login: 'testuser' },
			}

			vi.mocked(executeGhCommand).mockResolvedValueOnce(mockResponse)

			await provider.getIssue({ number: '789', includeComments: false })

			expect(executeGhCommand).toHaveBeenCalledWith([
				'issue',
				'view',
				'789',
				'--json',
				'body,title,labels,assignees,milestone,author,state,number,url',
			])
		})
	})

	describe('getComment', () => {
		it('uses explicit repo path when repo parameter is provided', async () => {
			const mockResponse = {
				id: 123456,
				body: 'Comment body',
				user: { login: 'commenter' },
				created_at: '2025-01-01T00:00:00Z',
			}

			vi.mocked(executeGhCommand).mockResolvedValueOnce(mockResponse)

			await provider.getComment({ commentId: '123456', number: '1', repo: 'other-owner/other-repo' })

			expect(executeGhCommand).toHaveBeenCalledWith([
				'api',
				'repos/other-owner/other-repo/issues/comments/123456',
				'--jq',
				'{id: .id, body: .body, user: .user, created_at: .created_at, updated_at: .updated_at, html_url: .html_url, reactions: .reactions}',
			])
		})

		it('uses :owner/:repo placeholder when repo parameter is undefined', async () => {
			const mockResponse = {
				id: 789012,
				body: 'Local comment body',
				user: { login: 'localcommenter' },
				created_at: '2025-01-02T00:00:00Z',
			}

			vi.mocked(executeGhCommand).mockResolvedValueOnce(mockResponse)

			await provider.getComment({ commentId: '789012', number: '2' })

			expect(executeGhCommand).toHaveBeenCalledWith([
				'api',
				'repos/:owner/:repo/issues/comments/789012',
				'--jq',
				'{id: .id, body: .body, user: .user, created_at: .created_at, updated_at: .updated_at, html_url: .html_url, reactions: .reactions}',
			])
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

	describe('createChildIssue', () => {
		it('should create child issue and link to parent', async () => {
			// Mock getIssueNodeId for parent
			vi.mocked(getIssueNodeId).mockResolvedValueOnce('I_kwDOPvp_cc6PARENT')
			// Mock createIssue to return child issue
			vi.mocked(createIssue).mockResolvedValueOnce({
				number: 124,
				url: 'https://github.com/owner/repo/issues/124',
			})
			// Mock getIssueNodeId for child
			vi.mocked(getIssueNodeId).mockResolvedValueOnce('I_kwDOPvp_cc6CHILD')
			// Mock addSubIssue GraphQL mutation
			vi.mocked(addSubIssue).mockResolvedValueOnce(undefined)

			const result = await provider.createChildIssue({
				parentId: '123',
				title: 'Child Issue',
				body: 'Child issue description',
			})

			// Verify parent node ID was fetched
			expect(getIssueNodeId).toHaveBeenNthCalledWith(1, 123)
			// Verify child issue was created
			expect(createIssue).toHaveBeenCalledWith('Child Issue', 'Child issue description', { labels: undefined })
			// Verify child node ID was fetched
			expect(getIssueNodeId).toHaveBeenNthCalledWith(2, 124)
			// Verify sub-issue link was created
			expect(addSubIssue).toHaveBeenCalledWith('I_kwDOPvp_cc6PARENT', 'I_kwDOPvp_cc6CHILD')
			// Verify result
			expect(result.id).toBe('124')
			expect(result.url).toBe('https://github.com/owner/repo/issues/124')
			expect(result.number).toBe(124)
		})

		it('should create child issue with labels', async () => {
			vi.mocked(getIssueNodeId).mockResolvedValueOnce('I_kwDOPvp_cc6PARENT')
			vi.mocked(createIssue).mockResolvedValueOnce({
				number: 125,
				url: 'https://github.com/owner/repo/issues/125',
			})
			vi.mocked(getIssueNodeId).mockResolvedValueOnce('I_kwDOPvp_cc6CHILD')
			vi.mocked(addSubIssue).mockResolvedValueOnce(undefined)

			const result = await provider.createChildIssue({
				parentId: '123',
				title: 'Labeled Child',
				body: 'Body with labels',
				labels: ['bug', 'priority:high'],
			})

			expect(createIssue).toHaveBeenCalledWith('Labeled Child', 'Body with labels', {
				labels: ['bug', 'priority:high'],
			})
			expect(result.id).toBe('125')
		})

		it('should throw error when parent issue number is invalid', async () => {
			await expect(
				provider.createChildIssue({
					parentId: 'invalid',
					title: 'Child Issue',
					body: 'Body',
				})
			).rejects.toThrow('Invalid GitHub parent issue number: invalid. GitHub issue IDs must be numeric.')

			expect(getIssueNodeId).not.toHaveBeenCalled()
			expect(createIssue).not.toHaveBeenCalled()
		})

		it('should throw error when parent issue not found', async () => {
			vi.mocked(getIssueNodeId).mockRejectedValueOnce(new Error('Could not find issue 999'))

			await expect(
				provider.createChildIssue({
					parentId: '999',
					title: 'Child Issue',
					body: 'Body',
				})
			).rejects.toThrow('Could not find issue 999')

			expect(getIssueNodeId).toHaveBeenCalledWith(999)
			expect(createIssue).not.toHaveBeenCalled()
		})

		it('should throw error when addSubIssue mutation fails', async () => {
			// Note: Child issue will exist but not be linked if this fails
			vi.mocked(getIssueNodeId).mockResolvedValueOnce('I_kwDOPvp_cc6PARENT')
			vi.mocked(createIssue).mockResolvedValueOnce({
				number: 126,
				url: 'https://github.com/owner/repo/issues/126',
			})
			vi.mocked(getIssueNodeId).mockResolvedValueOnce('I_kwDOPvp_cc6CHILD')
			vi.mocked(addSubIssue).mockRejectedValueOnce(new Error('GraphQL mutation failed'))

			await expect(
				provider.createChildIssue({
					parentId: '123',
					title: 'Child Issue',
					body: 'Body',
				})
			).rejects.toThrow('GraphQL mutation failed')

			// All steps before addSubIssue should have been called
			expect(getIssueNodeId).toHaveBeenCalledTimes(2)
			expect(createIssue).toHaveBeenCalled()
			expect(addSubIssue).toHaveBeenCalled()
		})

		it('should ignore teamKey parameter', async () => {
			vi.mocked(getIssueNodeId).mockResolvedValueOnce('I_kwDOPvp_cc6PARENT')
			vi.mocked(createIssue).mockResolvedValueOnce({
				number: 127,
				url: 'https://github.com/owner/repo/issues/127',
			})
			vi.mocked(getIssueNodeId).mockResolvedValueOnce('I_kwDOPvp_cc6CHILD')
			vi.mocked(addSubIssue).mockResolvedValueOnce(undefined)

			const result = await provider.createChildIssue({
				parentId: '123',
				title: 'Child with teamKey',
				body: 'Body',
				teamKey: 'ENG', // Should be ignored for GitHub
			})

			expect(createIssue).toHaveBeenCalledWith('Child with teamKey', 'Body', { labels: undefined })
			expect(result.id).toBe('127')
		})
	})
})
