/**
 * Jira implementation of Issue Management Provider
 * Uses JiraIssueTracker for all operations
 * Normalizes Jira-specific fields to provider-agnostic core fields
 */

import type {
	IssueManagementProvider,
	GetIssueInput,
	GetCommentInput,
	CreateCommentInput,
	UpdateCommentInput,
	CreateIssueInput,
	CreateIssueResult,
	IssueResult,
	CommentDetailResult,
	CommentResult,
	FlexibleAuthor,
} from './types.js'
import { JiraIssueTracker } from '../lib/providers/jira/JiraIssueTracker.js'
import type { JiraTrackerConfig } from '../lib/providers/jira/JiraIssueTracker.js'
import type { Issue } from '../types/index.js'

/**
 * Normalize Jira author to FlexibleAuthor format
 */
function normalizeAuthor(author: { displayName?: string; emailAddress?: string; accountId?: string } | null | undefined): FlexibleAuthor | null {
	if (!author) return null

	return {
		id: author.accountId ?? author.emailAddress ?? 'unknown',
		displayName: author.displayName ?? author.emailAddress ?? 'Unknown',
		...(author.emailAddress && { email: author.emailAddress }),
		...(author.accountId && { accountId: author.accountId }),
	}
}

/**
 * Jira-specific implementation of IssueManagementProvider
 */
export class JiraIssueManagementProvider implements IssueManagementProvider {
	readonly providerName = 'jira'
	readonly issuePrefix = ''
	private tracker: JiraIssueTracker

	constructor() {
		// Read configuration from environment variables
		const host = process.env.JIRA_HOST
		const username = process.env.JIRA_USERNAME
		const apiToken = process.env.JIRA_API_TOKEN
		const projectKey = process.env.JIRA_PROJECT_KEY

		if (!host || !username || !apiToken || !projectKey) {
			throw new Error(
				'Missing required Jira environment variables: JIRA_HOST, JIRA_USERNAME, JIRA_API_TOKEN, JIRA_PROJECT_KEY'
			)
		}

		const config: JiraTrackerConfig = {
			host,
			username,
			apiToken,
			projectKey,
		}

		// Parse transition mappings if provided
		if (process.env.JIRA_TRANSITION_MAPPINGS) {
			try {
				config.transitionMappings = JSON.parse(process.env.JIRA_TRANSITION_MAPPINGS)
			} catch (error) {
				console.error('Failed to parse JIRA_TRANSITION_MAPPINGS:', error)
			}
		}

		this.tracker = new JiraIssueTracker(config)
	}

	/**
	 * Fetch issue details using JiraIssueTracker
	 */
	async getIssue(input: GetIssueInput): Promise<IssueResult> {
		const { number, includeComments = true } = input

		// Fetch issue from Jira
		const issue = await this.tracker.getIssue(number)
		const issueExt = issue as Issue & {
			id?: string
			key?: string
			author?: {
				displayName?: string
				emailAddress?: string
				accountId?: string
			}
			issueType?: string
			priority?: string
			status?: string
		}

		// Normalize to IssueResult format
		const result: IssueResult = {
			id: issueExt.id ?? String(issue.number),
			title: issue.title,
			body: issue.body,
			state: issue.state,
			url: issue.url,
			provider: 'jira',
			author: normalizeAuthor(issueExt.author),
			number: issue.number,
			key: issueExt.key,
			// Preserve Jira-specific fields
			...(issueExt.issueType && { issueType: issueExt.issueType }),
			...(issueExt.priority && { priority: issueExt.priority }),
			...(issueExt.status && { status: issueExt.status }),
		}

		// Add labels if present
		if (issue.labels && issue.labels.length > 0) {
			result.labels = issue.labels.map(label => ({ name: label }))
		}

		// Add assignees if present - Issue type uses assignees array of strings
		if (issue.assignees && issue.assignees.length > 0) {
			result.assignees = issue.assignees.map(name => ({
				id: name,
				displayName: name,
			}))
		}

		// Fetch and add comments if requested
		if (includeComments) {
			const comments = await this.tracker.getComments(number)
			result.comments = comments.map((comment: {
				id: string
				body: string
				author: { displayName: string; emailAddress: string; accountId: string }
				createdAt: string
				updatedAt: string
			}) => ({
				id: comment.id,
				body: comment.body,
				author: normalizeAuthor(comment.author),
				createdAt: comment.createdAt,
				updatedAt: comment.updatedAt,
			}))
		}

		return result
	}

	/**
	 * Fetch a specific comment by ID
	 */
	async getComment(input: GetCommentInput): Promise<CommentDetailResult> {
		const { commentId, number } = input

		// Fetch all comments and find the specific one
		const comments = await this.tracker.getComments(number)
		const comment = comments.find(c => c.id === commentId)

		if (!comment) {
			throw new Error(`Comment ${commentId} not found on issue ${number}`)
		}

		return {
			id: comment.id,
			body: comment.body,
			author: normalizeAuthor(comment.author),
			created_at: comment.createdAt,
			updated_at: comment.updatedAt,
		}
	}

	/**
	 * Create a new comment on an issue
	 */
	async createComment(input: CreateCommentInput): Promise<CommentResult> {
		const { number, body } = input

		// Jira doesn't distinguish between issue and PR comments
		const comment = await this.tracker.addComment(number, body)

		return {
			id: comment.id,
			url: `${this.tracker.getConfig().host}/browse/${number}?focusedCommentId=${comment.id}`,
			created_at: new Date().toISOString(),
		}
	}

	/**
	 * Update an existing comment
	 */
	async updateComment(input: UpdateCommentInput): Promise<CommentResult> {
		const { commentId, number, body } = input

		// Update comment via tracker
		await this.tracker.updateComment(number, commentId, body)

		return {
			id: commentId,
			url: `${this.tracker.getConfig().host}/browse/${number}?focusedCommentId=${commentId}`,
			updated_at: new Date().toISOString(),
		}
	}

	/**
	 * Create a new issue
	 */
	async createIssue(input: CreateIssueInput): Promise<CreateIssueResult> {
		const { title, body } = input

		// Create issue via tracker (labels not supported in current implementation)
		const issue = await this.tracker.createIssue(title, body)

		const result: CreateIssueResult = {
			id: String(issue.number),
			url: issue.url,
		}

		// Only add number if it's actually a number
		if (typeof issue.number === 'number') {
			result.number = issue.number
		}

		return result
	}
}
