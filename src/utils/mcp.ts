import path from 'path'
import { getRepoInfo } from './github.js'
import { logger } from './logger.js'

/**
 * Generate MCP configuration for GitHub comment broker
 * Uses a single server that can handle both issues and pull requests
 * Returns array of MCP server config objects
 */
export async function generateGitHubCommentMcpConfig(contextType?: 'issue' | 'pr'): Promise<Record<string, unknown>[]> {
	// Get repository information
	const repoInfo = await getRepoInfo()

	// Map logical types to GitHub's webhook event names (handle GitHub's naming quirk here)
	const githubEventName = contextType === 'issue' ? 'issues' : contextType === 'pr' ? 'pull_request' : undefined

	// Generate single MCP server config
	const mcpServerConfig = {
		mcpServers: {
			github_comment: {
				transport: 'stdio',
				command: 'node',
				args: [path.join(path.dirname(new globalThis.URL(import.meta.url).pathname), '../dist/mcp/github-comment-server.js')],
				env: {
					REPO_OWNER: repoInfo.owner,
					REPO_NAME: repoInfo.name,
					GITHUB_API_URL: 'https://api.github.com/',
					...(githubEventName && { GITHUB_EVENT_NAME: githubEventName }),
				},
			},
		},
	}

	logger.debug('Generated MCP config for GitHub comment broker', {
		repoOwner: repoInfo.owner,
		repoName: repoInfo.name,
		contextType: contextType ?? 'auto-detect',
		githubEventName: githubEventName ?? 'auto-detect'
	})

	return [mcpServerConfig]
}