/**
 * Linear implementation of Issue Management Provider
 * Uses @linear/sdk for all operations
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
} from './types.js'
import {
	fetchLinearIssue,
	createLinearComment,
	getLinearComment,
	updateLinearComment,
	fetchLinearIssueComments,
	createLinearIssue,
} from '../utils/linear.js'
import { LinearMarkupConverter } from '../utils/linear-markup-converter.js'

/**
 * Linear-specific implementation of IssueManagementProvider
 */
export class LinearIssueManagementProvider implements IssueManagementProvider {
	readonly providerName = 'linear'
	readonly issuePrefix = ''

	/**
	 * Cached team key extracted from issue identifiers (e.g., "ENG-123" -> "ENG")
	 * Used as fallback when teamKey is not explicitly provided to createIssue()
	 */
	private cachedTeamKey: string | undefined = undefined

	/**
	 * Fetch issue details using Linear SDK
	 */
	async getIssue(input: GetIssueInput): Promise<IssueResult> {
		const { number, includeComments = true } = input

		// Extract and cache team key from identifier (e.g., "ENG-123" -> "ENG")
		// This enables createIssue() to use the team key as a fallback
		const match = number.match(/^([A-Z]{2,})-\d+$/i)
		if (match?.[1]) {
			this.cachedTeamKey = match[1].toUpperCase()
		}

		// Fetch issue - Linear uses alphanumeric identifiers like "ENG-123"
		const raw = await fetchLinearIssue(number)

		// Map Linear state name to open/closed
		const state = raw.state && (raw.state.toLowerCase().includes('done') || raw.state.toLowerCase().includes('completed') || raw.state.toLowerCase().includes('canceled'))
			? 'closed'
			: 'open'

		// Build result
		const result: IssueResult = {
			id: raw.identifier,
			title: raw.title,
			body: raw.description ?? '',
			state,
			url: raw.url,
			provider: 'linear',
			author: null, // Linear SDK doesn't return author in basic fetch

			// Linear-specific fields
			linearState: raw.state,
			createdAt: raw.createdAt,
			updatedAt: raw.updatedAt,
		}

		// Fetch comments if requested
		if (includeComments) {
			try {
				const comments = await this.fetchIssueComments(number)
				if (comments) {
					result.comments = comments
				}
			} catch {
				// If comments fail, continue without them
			}
		}

		return result
	}

	/**
	 * Fetch comments for an issue
	 */
	private async fetchIssueComments(identifier: string): Promise<IssueResult['comments']> {
		try {
			const comments = await fetchLinearIssueComments(identifier)

			return comments.map(comment => ({
				id: comment.id,
				body: comment.body,
				createdAt: comment.createdAt,
				author: null, // Linear SDK doesn't return comment author info in basic fetch
				...(comment.updatedAt && { updatedAt: comment.updatedAt }),
			}))
		} catch {
			return []
		}
	}

	/**
	 * Fetch a specific comment by ID
	 */
	async getComment(input: GetCommentInput): Promise<CommentDetailResult> {
		const { commentId } = input

		const raw = await getLinearComment(commentId)

		return {
			id: raw.id,
			body: raw.body,
			author: null, // Linear SDK doesn't return comment author info in basic fetch
			created_at: raw.createdAt,
		}
	}

	/**
	 * Create a new comment on an issue
	 */
	async createComment(input: CreateCommentInput): Promise<CommentResult> {
		const { number, body } = input
		// Note: Linear doesn't distinguish between issue and PR comments
		// (Linear doesn't have PRs - that's GitHub-specific)

		// Convert HTML details/summary blocks to Linear's collapsible format
		const convertedBody = LinearMarkupConverter.convertToLinear(body)

		const result = await createLinearComment(number, convertedBody)

		return {
			id: result.id,
			url: result.url,
			created_at: result.createdAt,
		}
	}

	/**
	 * Update an existing comment
	 */
	async updateComment(input: UpdateCommentInput): Promise<CommentResult> {
		const { commentId, body } = input

		// Convert HTML details/summary blocks to Linear's collapsible format
		const convertedBody = LinearMarkupConverter.convertToLinear(body)

		const result = await updateLinearComment(commentId, convertedBody)

		return {
			id: result.id,
			url: result.url,
			updated_at: result.updatedAt,
		}
	}

	/**
	 * Create a new issue
	 */
	async createIssue(input: CreateIssueInput): Promise<CreateIssueResult> {
		const { title, body, labels, teamKey } = input

		// Fallback chain: explicit param > settings (via env) > cached key from getIssue()
		const effectiveTeamKey = teamKey ?? process.env.LINEAR_TEAM_KEY ?? this.cachedTeamKey

		if (!effectiveTeamKey) {
			throw new Error('teamKey is required for Linear issue creation. Configure issueManagement.linear.teamId in settings, or call getIssue first to extract the team from an issue identifier.')
		}

		const result = await createLinearIssue(title, body, effectiveTeamKey, labels)

		return {
			id: result.identifier,
			url: result.url,
		}
	}
}
