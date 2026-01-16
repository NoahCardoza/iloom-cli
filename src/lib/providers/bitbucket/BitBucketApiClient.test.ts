import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BitBucketApiClient, type BitBucketConfig } from './BitBucketApiClient.js'

// Mock the https module
vi.mock('node:https', () => ({
	default: {
		request: vi.fn(),
	},
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

describe('BitBucketApiClient', () => {
	let client: BitBucketApiClient
	const config: BitBucketConfig = {
		username: 'testuser',
		apiToken: 'test-api-token',
		workspace: 'test-workspace',
		repoSlug: 'test-repo',
	}

	beforeEach(() => {
		client = new BitBucketApiClient(config)
	})

	describe('createPullRequest', () => {
		it('should include reviewers in payload when provided', async () => {
			const https = await import('node:https')
			let capturedPayload: string | undefined

			// Mock the request to capture the payload
			vi.mocked(https.default.request).mockImplementation((options, callback) => {
				const mockResponse = {
					statusCode: 201,
					on: vi.fn((event, handler) => {
						if (event === 'data') {
							handler(JSON.stringify({
								id: 123,
								title: 'Test PR',
								links: { html: { href: 'https://bitbucket.org/test/pr/123' } },
							}))
						}
						if (event === 'end') {
							handler()
						}
						return mockResponse
					}),
				}
				// @ts-expect-error - Mock callback
				callback(mockResponse)
				return {
					on: vi.fn(),
					write: (data: string) => { capturedPayload = data },
					end: vi.fn(),
				}
			})

			await client.createPullRequest(
				'workspace',
				'repo',
				'Test PR',
				'Test description',
				'feature-branch',
				'main',
				['account-id-1', 'account-id-2']
			)

			expect(capturedPayload).toBeDefined()
			const payload = JSON.parse(capturedPayload!)
			expect(payload.reviewers).toEqual([
				{ account_id: 'account-id-1' },
				{ account_id: 'account-id-2' },
			])
		})

		it('should not include reviewers in payload when not provided', async () => {
			const https = await import('node:https')
			let capturedPayload: string | undefined

			vi.mocked(https.default.request).mockImplementation((options, callback) => {
				const mockResponse = {
					statusCode: 201,
					on: vi.fn((event, handler) => {
						if (event === 'data') {
							handler(JSON.stringify({
								id: 123,
								title: 'Test PR',
								links: { html: { href: 'https://bitbucket.org/test/pr/123' } },
							}))
						}
						if (event === 'end') {
							handler()
						}
						return mockResponse
					}),
				}
				// @ts-expect-error - Mock callback
				callback(mockResponse)
				return {
					on: vi.fn(),
					write: (data: string) => { capturedPayload = data },
					end: vi.fn(),
				}
			})

			await client.createPullRequest(
				'workspace',
				'repo',
				'Test PR',
				'Test description',
				'feature-branch',
				'main'
			)

			expect(capturedPayload).toBeDefined()
			const payload = JSON.parse(capturedPayload!)
			expect(payload.reviewers).toBeUndefined()
		})

		it('should not include reviewers when array is empty', async () => {
			const https = await import('node:https')
			let capturedPayload: string | undefined

			vi.mocked(https.default.request).mockImplementation((options, callback) => {
				const mockResponse = {
					statusCode: 201,
					on: vi.fn((event, handler) => {
						if (event === 'data') {
							handler(JSON.stringify({
								id: 123,
								title: 'Test PR',
								links: { html: { href: 'https://bitbucket.org/test/pr/123' } },
							}))
						}
						if (event === 'end') {
							handler()
						}
						return mockResponse
					}),
				}
				// @ts-expect-error - Mock callback
				callback(mockResponse)
				return {
					on: vi.fn(),
					write: (data: string) => { capturedPayload = data },
					end: vi.fn(),
				}
			})

			await client.createPullRequest(
				'workspace',
				'repo',
				'Test PR',
				'Test description',
				'feature-branch',
				'main',
				[]
			)

			expect(capturedPayload).toBeDefined()
			const payload = JSON.parse(capturedPayload!)
			expect(payload.reviewers).toBeUndefined()
		})
	})

	describe('findUsersByEmail', () => {
		it('should return map of email to account_id for matched users', async () => {
			const https = await import('node:https')

			vi.mocked(https.default.request).mockImplementation((options, callback) => {
				const mockResponse = {
					statusCode: 200,
					on: vi.fn((event, handler) => {
						if (event === 'data') {
							handler(JSON.stringify({
								values: [
									{ user: { account_id: 'acc-1', display_name: 'Alice Test', uuid: 'uuid-1', nickname: 'alice' } },
									{ user: { account_id: 'acc-2', display_name: 'Bob Example', uuid: 'uuid-2', nickname: 'bob' } },
								],
							}))
						}
						if (event === 'end') {
							handler()
						}
						return mockResponse
					}),
				}
				// @ts-expect-error - Mock callback
				callback(mockResponse)
				return {
					on: vi.fn(),
					write: vi.fn(),
					end: vi.fn(),
				}
			})

			const result = await client.findUsersByEmail('workspace', ['alice@example.com', 'bob@example.com'])

			expect(result.get('alice@example.com')).toBe('acc-1')
			expect(result.get('bob@example.com')).toBe('acc-2')
		})

		it('should return empty map when no users match', async () => {
			const https = await import('node:https')

			vi.mocked(https.default.request).mockImplementation((options, callback) => {
				const mockResponse = {
					statusCode: 200,
					on: vi.fn((event, handler) => {
						if (event === 'data') {
							handler(JSON.stringify({
								values: [
									{ user: { account_id: 'acc-1', display_name: 'Charlie Different', uuid: 'uuid-1', nickname: 'charlie' } },
								],
							}))
						}
						if (event === 'end') {
							handler()
						}
						return mockResponse
					}),
				}
				// @ts-expect-error - Mock callback
				callback(mockResponse)
				return {
					on: vi.fn(),
					write: vi.fn(),
					end: vi.fn(),
				}
			})

			const result = await client.findUsersByEmail('workspace', ['alice@example.com'])

			expect(result.size).toBe(0)
		})

		it('should handle API errors gracefully', async () => {
			const https = await import('node:https')

			vi.mocked(https.default.request).mockImplementation((options, callback) => {
				const mockResponse = {
					statusCode: 403,
					on: vi.fn((event, handler) => {
						if (event === 'data') {
							handler(JSON.stringify({ error: { message: 'Access denied' } }))
						}
						if (event === 'end') {
							handler()
						}
						return mockResponse
					}),
				}
				// @ts-expect-error - Mock callback
				callback(mockResponse)
				return {
					on: vi.fn(),
					write: vi.fn(),
					end: vi.fn(),
				}
			})

			// Should not throw, just return empty map
			const result = await client.findUsersByEmail('workspace', ['alice@example.com'])
			expect(result.size).toBe(0)
		})
	})

	describe('getWorkspace', () => {
		it('should return configured workspace', () => {
			expect(client.getWorkspace()).toBe('test-workspace')
		})
	})

	describe('getRepoSlug', () => {
		it('should return configured repoSlug', () => {
			expect(client.getRepoSlug()).toBe('test-repo')
		})
	})
})
