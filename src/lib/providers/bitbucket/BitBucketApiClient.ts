// BitBucketApiClient - REST API wrapper for BitBucket operations
// Handles authentication and common API request patterns

import https from 'node:https'
import { getLogger } from '../../../utils/logger-context.js'

/**
 * BitBucket API configuration
 */
export interface BitBucketConfig {
	username: string
	apiToken: string // API token from BitBucket settings
	workspace?: string // Optional, can be auto-detected from git remote
	repoSlug?: string // Optional, can be auto-detected from git remote
}

/**
 * BitBucket pull request response from API
 */
export interface BitBucketPullRequest {
	id: number
	title: string
	description: string
	state: 'OPEN' | 'MERGED' | 'DECLINED' | 'SUPERSEDED'
	author: {
		display_name: string
		uuid: string
	}
	source: {
		branch: {
			name: string
		}
	}
	destination: {
		branch: {
			name: string
		}
	}
	created_on: string
	updated_on: string
	links: {
		html: {
			href: string
		}
	}
	[key: string]: unknown
}

/**
 * BitBucket repository response from API
 */
export interface BitBucketRepository {
	slug: string
	name: string
	full_name: string
	workspace: {
		slug: string
	}
	links: {
		html: {
			href: string
		}
	}
	[key: string]: unknown
}

/**
 * BitBucketApiClient provides low-level REST API access to BitBucket
 * 
 * Authentication: Basic Auth with username and API token
 * API Reference: https://developer.atlassian.com/cloud/bitbucket/rest/intro/
 * 
 * Note: As of September 9, 2025, BitBucket app passwords can no longer be created.
 * Use API tokens with scopes instead. All existing app passwords will be disabled on June 9, 2026.
 */
export class BitBucketApiClient {
	private readonly baseUrl = 'https://api.bitbucket.org/2.0'
	private readonly authHeader: string
	private readonly workspace: string | undefined
	private readonly repoSlug: string | undefined

	constructor(config: BitBucketConfig) {
		// Create Basic Auth header with API token
		const credentials = Buffer.from(`${config.username}:${config.apiToken}`).toString('base64')
		this.authHeader = `Basic ${credentials}`
		
		this.workspace = config.workspace
		this.repoSlug = config.repoSlug
	}

	/**
	 * Make an HTTP request to BitBucket API
	 */
	private async request<T>(
		method: 'GET' | 'POST',
		endpoint: string,
		body?: unknown
	): Promise<T> {
		const url = new URL(`${this.baseUrl}${endpoint}`)
		getLogger().debug(`BitBucket API ${method} request`, { url: url.toString() })

		return new Promise((resolve, reject) => {
			const options: https.RequestOptions = {
				hostname: url.hostname,
				port: url.port || 443,
				path: url.pathname + url.search,
				method,
				headers: {
					'Authorization': this.authHeader,
					'Accept': 'application/json',
					'Content-Type': 'application/json',
				},
			}

			const req = https.request(options, (res) => {
				let data = ''

				res.on('data', (chunk) => {
					data += chunk
				})

				res.on('end', () => {
					if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
						reject(new Error(`BitBucket API error (${res.statusCode}): ${data}`))
						return
					}

					// Handle empty response
					if (res.statusCode === 204 || !data) {
						resolve({} as T)
						return
					}

					try {
						resolve(JSON.parse(data) as T)
					} catch (error) {
						reject(new Error(`Failed to parse BitBucket API response: ${error}`))
					}
				})
			})

			req.on('error', (error) => {
				reject(new Error(`BitBucket API request failed: ${error.message}`))
			})

			if (body) {
				req.write(JSON.stringify(body))
			}

			req.end()
		})
	}

	/**
	 * Make a GET request to BitBucket API
	 */
	private async get<T>(endpoint: string): Promise<T> {
		return this.request<T>('GET', endpoint)
	}

	/**
	 * Make a POST request to BitBucket API
	 */
	private async post<T>(endpoint: string, body: unknown): Promise<T> {
		return this.request<T>('POST', endpoint, body)
	}

	/**
	 * Get repository information
	 */
	async getRepository(workspace: string, repoSlug: string): Promise<BitBucketRepository> {
		return this.get<BitBucketRepository>(`/repositories/${workspace}/${repoSlug}`)
	}

	/**
	 * Get a pull request by ID
	 */
	async getPullRequest(
		workspace: string,
		repoSlug: string,
		prId: number
	): Promise<BitBucketPullRequest> {
		return this.get<BitBucketPullRequest>(
			`/repositories/${workspace}/${repoSlug}/pullrequests/${prId}`
		)
	}

	/**
	 * List open pull requests for a branch
	 */
	async listPullRequests(
		workspace: string,
		repoSlug: string,
		sourceBranch?: string
	): Promise<BitBucketPullRequest[]> {
		let endpoint = `/repositories/${workspace}/${repoSlug}/pullrequests?state=OPEN`
		
		if (sourceBranch) {
			endpoint += `&source.branch.name=${encodeURIComponent(sourceBranch)}`
		}

		const response = await this.get<{ values: BitBucketPullRequest[] }>(endpoint)
		return response.values
	}

	/**
	 * Create a pull request
	 */
	async createPullRequest(
		workspace: string,
		repoSlug: string,
		title: string,
		description: string,
		sourceBranch: string,
		destinationBranch: string
	): Promise<BitBucketPullRequest> {
		return this.post<BitBucketPullRequest>(
			`/repositories/${workspace}/${repoSlug}/pullrequests`,
			{
				title,
				description,
				source: {
					branch: {
						name: sourceBranch,
					},
				},
				destination: {
					branch: {
						name: destinationBranch,
					},
				},
			}
		)
	}

	/**
	 * Add a comment to a pull request
	 */
	async addPRComment(
		workspace: string,
		repoSlug: string,
		prId: number,
		content: string
	): Promise<void> {
		await this.post(
			`/repositories/${workspace}/${repoSlug}/pullrequests/${prId}/comments`,
			{
				content: {
					raw: content,
				},
			}
		)
	}

	/**
	 * Test connection to BitBucket API
	 */
	async testConnection(): Promise<boolean> {
		try {
			await this.get('/user')
			return true
		} catch (error) {
			getLogger().error('BitBucket connection test failed', { error })
			return false
		}
	}

	/**
	 * Get configured workspace
	 */
	getWorkspace(): string | undefined {
		return this.workspace
	}

	/**
	 * Get configured repository slug
	 */
	getRepoSlug(): string | undefined {
		return this.repoSlug
	}
}
