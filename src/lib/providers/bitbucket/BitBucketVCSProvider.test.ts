import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BitBucketVCSProvider, type BitBucketVCSConfig } from './BitBucketVCSProvider.js'
import { BitBucketApiClient } from './BitBucketApiClient.js'

// Mock the BitBucketApiClient
vi.mock('./BitBucketApiClient.js', () => ({
	BitBucketApiClient: vi.fn().mockImplementation(() => ({
		getWorkspace: vi.fn().mockReturnValue('test-workspace'),
		getRepoSlug: vi.fn().mockReturnValue('test-repo'),
		createPullRequest: vi.fn(),
		findUsersByEmail: vi.fn(),
		listPullRequests: vi.fn(),
		getPullRequest: vi.fn(),
		addPRComment: vi.fn(),
	})),
}))

// Mock the logger
vi.mock('../../../utils/logger-context.js', () => ({
	getLogger: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	}),
}))

// Mock the remote parser
vi.mock('../../../utils/remote.js', () => ({
	parseGitRemotes: vi.fn().mockResolvedValue([]),
}))

describe('BitBucketVCSProvider', () => {
	let provider: BitBucketVCSProvider
	let mockClient: {
		getWorkspace: ReturnType<typeof vi.fn>
		getRepoSlug: ReturnType<typeof vi.fn>
		createPullRequest: ReturnType<typeof vi.fn>
		findUsersByEmail: ReturnType<typeof vi.fn>
		listPullRequests: ReturnType<typeof vi.fn>
		getPullRequest: ReturnType<typeof vi.fn>
		addPRComment: ReturnType<typeof vi.fn>
	}

	beforeEach(() => {
		vi.clearAllMocks()
		// Get the mock client instance
		mockClient = {
			getWorkspace: vi.fn().mockReturnValue('test-workspace'),
			getRepoSlug: vi.fn().mockReturnValue('test-repo'),
			createPullRequest: vi.fn(),
			findUsersByEmail: vi.fn(),
			listPullRequests: vi.fn(),
			getPullRequest: vi.fn(),
			addPRComment: vi.fn(),
		}
		vi.mocked(BitBucketApiClient).mockImplementation(() => mockClient as unknown as BitBucketApiClient)
	})

	describe('createPR with reviewers', () => {
		it('should resolve reviewer emails and pass account IDs to createPullRequest', async () => {
			const config: BitBucketVCSConfig = {
				username: 'testuser',
				apiToken: 'test-token',
				reviewers: ['alice@example.com', 'bob@example.com'],
			}
			provider = new BitBucketVCSProvider(config)

			// Mock email resolution
			mockClient.findUsersByEmail.mockResolvedValue(
				new Map([
					['alice@example.com', 'acc-alice'],
					['bob@example.com', 'acc-bob'],
				])
			)

			// Mock PR creation
			mockClient.createPullRequest.mockResolvedValue({
				id: 123,
				title: 'Test PR',
				description: 'Test body',
				state: 'OPEN',
				author: { display_name: 'Test', uuid: 'uuid' },
				source: { branch: { name: 'feature' } },
				destination: { branch: { name: 'main' } },
				created_on: '2024-01-01',
				updated_on: '2024-01-01',
				links: { html: { href: 'https://bitbucket.org/test/pr/123' } },
			})

			const url = await provider.createPR('feature', 'Test PR', 'Test body', 'main')

			// Verify findUsersByEmail was called with the configured emails
			expect(mockClient.findUsersByEmail).toHaveBeenCalledWith(
				'test-workspace',
				['alice@example.com', 'bob@example.com']
			)

			// Verify createPullRequest was called with resolved account IDs
			expect(mockClient.createPullRequest).toHaveBeenCalledWith(
				'test-workspace',
				'test-repo',
				'Test PR',
				'Test body',
				'feature',
				'main',
				['acc-alice', 'acc-bob']
			)

			expect(url).toBe('https://bitbucket.org/test/pr/123')
		})

		it('should continue with partial reviewers when some emails cannot be resolved', async () => {
			const config: BitBucketVCSConfig = {
				username: 'testuser',
				apiToken: 'test-token',
				reviewers: ['alice@example.com', 'unknown@example.com'],
			}
			provider = new BitBucketVCSProvider(config)

			// Only alice resolves
			mockClient.findUsersByEmail.mockResolvedValue(
				new Map([['alice@example.com', 'acc-alice']])
			)

			mockClient.createPullRequest.mockResolvedValue({
				id: 123,
				title: 'Test PR',
				links: { html: { href: 'https://bitbucket.org/test/pr/123' } },
			})

			await provider.createPR('feature', 'Test PR', 'Test body', 'main')

			// Should only pass the resolved reviewer
			expect(mockClient.createPullRequest).toHaveBeenCalledWith(
				'test-workspace',
				'test-repo',
				'Test PR',
				'Test body',
				'feature',
				'main',
				['acc-alice']
			)
		})

		it('should not pass reviewers when no emails can be resolved', async () => {
			const config: BitBucketVCSConfig = {
				username: 'testuser',
				apiToken: 'test-token',
				reviewers: ['unknown@example.com'],
			}
			provider = new BitBucketVCSProvider(config)

			// No emails resolve
			mockClient.findUsersByEmail.mockResolvedValue(new Map())

			mockClient.createPullRequest.mockResolvedValue({
				id: 123,
				title: 'Test PR',
				links: { html: { href: 'https://bitbucket.org/test/pr/123' } },
			})

			await provider.createPR('feature', 'Test PR', 'Test body', 'main')

			// Should pass empty array for reviewers
			expect(mockClient.createPullRequest).toHaveBeenCalledWith(
				'test-workspace',
				'test-repo',
				'Test PR',
				'Test body',
				'feature',
				'main',
				[]
			)
		})

		it('should not resolve reviewers when none are configured', async () => {
			const config: BitBucketVCSConfig = {
				username: 'testuser',
				apiToken: 'test-token',
				// No reviewers configured
			}
			provider = new BitBucketVCSProvider(config)

			mockClient.createPullRequest.mockResolvedValue({
				id: 123,
				title: 'Test PR',
				links: { html: { href: 'https://bitbucket.org/test/pr/123' } },
			})

			await provider.createPR('feature', 'Test PR', 'Test body', 'main')

			// findUsersByEmail should not be called
			expect(mockClient.findUsersByEmail).not.toHaveBeenCalled()

			// createPullRequest should be called without reviewers
			expect(mockClient.createPullRequest).toHaveBeenCalledWith(
				'test-workspace',
				'test-repo',
				'Test PR',
				'Test body',
				'feature',
				'main',
				undefined
			)
		})

		it('should not resolve reviewers when array is empty', async () => {
			const config: BitBucketVCSConfig = {
				username: 'testuser',
				apiToken: 'test-token',
				reviewers: [],
			}
			provider = new BitBucketVCSProvider(config)

			mockClient.createPullRequest.mockResolvedValue({
				id: 123,
				title: 'Test PR',
				links: { html: { href: 'https://bitbucket.org/test/pr/123' } },
			})

			await provider.createPR('feature', 'Test PR', 'Test body', 'main')

			// findUsersByEmail should not be called
			expect(mockClient.findUsersByEmail).not.toHaveBeenCalled()

			// createPullRequest should be called without reviewers
			expect(mockClient.createPullRequest).toHaveBeenCalledWith(
				'test-workspace',
				'test-repo',
				'Test PR',
				'Test body',
				'feature',
				'main',
				undefined
			)
		})
	})

	describe('provider properties', () => {
		it('should have correct provider name', () => {
			const config: BitBucketVCSConfig = {
				username: 'testuser',
				apiToken: 'test-token',
			}
			provider = new BitBucketVCSProvider(config)
			expect(provider.providerName).toBe('bitbucket')
		})

		it('should not support draft PRs', () => {
			const config: BitBucketVCSConfig = {
				username: 'testuser',
				apiToken: 'test-token',
			}
			provider = new BitBucketVCSProvider(config)
			expect(provider.supportsDraftPRs).toBe(false)
		})

		it('should support forks', () => {
			const config: BitBucketVCSConfig = {
				username: 'testuser',
				apiToken: 'test-token',
			}
			provider = new BitBucketVCSProvider(config)
			expect(provider.supportsForks).toBe(true)
		})
	})
})
