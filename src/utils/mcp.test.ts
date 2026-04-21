import { describe, it, expect, vi } from 'vitest'
import { generateRecapMcpConfig, generateHarnessMcpConfig, generateIssueManagementMcpConfig } from './mcp.js'
import os from 'os'
import path from 'path'
import type { LoomMetadata } from '../lib/MetadataManager.js'
import type { IloomSettings } from '../lib/SettingsManager.js'

// Mock the github module
vi.mock('./github.js', () => ({
	getRepoInfo: vi.fn().mockResolvedValue({ owner: 'test-owner', name: 'test-repo' }),
}))

// Mock the logger
vi.mock('./logger.js', () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}))

// Helper to create mock LoomMetadata
function createMockMetadata(overrides: Partial<LoomMetadata> = {}): LoomMetadata {
	return {
		description: 'Test issue #123',
		created_at: '2025-01-01T00:00:00Z',
		branchName: 'feat/issue-123',
		worktreePath: '/Users/test/projects/my-repo',
		issueType: 'issue',
		issue_numbers: ['123'],
		databaseBranchName: null,
		parentLoomBranch: null,
		...overrides,
	}
}

describe('generateRecapMcpConfig', () => {
	it('should generate MCP config with correct structure', () => {
		const loomPath = '/Users/test/projects/my-repo'
		const loomMetadata = createMockMetadata()

		const config = generateRecapMcpConfig(loomPath, loomMetadata)

		expect(config).toHaveLength(1)
		expect(config[0]).toHaveProperty('mcpServers')
		expect(config[0].mcpServers).toHaveProperty('recap')
	})

	it('should include RECAP_FILE_PATH env var with slugified path', () => {
		const loomPath = '/Users/test/projects/my-repo'
		const loomMetadata = createMockMetadata()

		const config = generateRecapMcpConfig(loomPath, loomMetadata)

		const recapConfig = (config[0].mcpServers as Record<string, unknown>).recap as Record<string, unknown>
		const env = recapConfig.env as Record<string, string>

		expect(env.RECAP_FILE_PATH).toBeDefined()
		expect(env.RECAP_FILE_PATH).toContain(path.join(os.homedir(), '.config', 'iloom-ai', 'recaps'))
		expect(env.RECAP_FILE_PATH).toContain('___Users___test___projects___my-repo.json')
	})

	it('should include LOOM_METADATA_JSON env var with stringified metadata', () => {
		const loomPath = '/Users/test/projects/my-repo'
		const loomMetadata = createMockMetadata({ description: 'Test issue for JSON' })

		const config = generateRecapMcpConfig(loomPath, loomMetadata)

		const recapConfig = (config[0].mcpServers as Record<string, unknown>).recap as Record<string, unknown>
		const env = recapConfig.env as Record<string, string>

		expect(env.LOOM_METADATA_JSON).toBeDefined()
		const parsed = JSON.parse(env.LOOM_METADATA_JSON)
		expect(parsed.description).toBe('Test issue for JSON')
		expect(parsed.branchName).toBe('feat/issue-123')
		expect(parsed.issue_numbers).toEqual(['123'])
	})

	it('should use node as command and point to recap-server.js', () => {
		const loomPath = '/Users/test/projects/my-repo'
		const loomMetadata = createMockMetadata()

		const config = generateRecapMcpConfig(loomPath, loomMetadata)

		const recapConfig = (config[0].mcpServers as Record<string, unknown>).recap as Record<string, unknown>

		expect(recapConfig.transport).toBe('stdio')
		expect(recapConfig.command).toBe('node')
		expect(recapConfig.args).toBeInstanceOf(Array)
		expect((recapConfig.args as string[])[0]).toContain('recap-server.js')
	})

	it('should slugify path correctly - replacing separators with triple underscores', () => {
		const loomPath = '/a/b/c'
		const loomMetadata = createMockMetadata()

		const config = generateRecapMcpConfig(loomPath, loomMetadata)

		const recapConfig = (config[0].mcpServers as Record<string, unknown>).recap as Record<string, unknown>
		const env = recapConfig.env as Record<string, string>

		expect(env.RECAP_FILE_PATH).toContain('___a___b___c.json')
	})

	it('should handle paths with special characters', () => {
		const loomPath = '/path/with spaces/and.dots'
		const loomMetadata = createMockMetadata()

		const config = generateRecapMcpConfig(loomPath, loomMetadata)

		const recapConfig = (config[0].mcpServers as Record<string, unknown>).recap as Record<string, unknown>
		const env = recapConfig.env as Record<string, string>

		// Special chars become hyphens, path separators become ___
		expect(env.RECAP_FILE_PATH).toContain('___path___with-spaces___and-dots.json')
	})

	it('should set RECAP_DISABLE_SET_GOAL for issue loom type', () => {
		const loomPath = '/Users/test/projects/my-repo'
		const loomMetadata = createMockMetadata({ issueType: 'issue' })

		const config = generateRecapMcpConfig(loomPath, loomMetadata)

		const recapConfig = (config[0].mcpServers as Record<string, unknown>).recap as Record<string, unknown>
		const env = recapConfig.env as Record<string, string>

		expect(env.RECAP_DISABLE_SET_GOAL).toBe('true')
	})

	it('should set RECAP_DISABLE_SET_GOAL for epic loom type', () => {
		const loomPath = '/Users/test/projects/my-repo'
		const loomMetadata = createMockMetadata({ issueType: 'epic' })

		const config = generateRecapMcpConfig(loomPath, loomMetadata)

		const recapConfig = (config[0].mcpServers as Record<string, unknown>).recap as Record<string, unknown>
		const env = recapConfig.env as Record<string, string>

		expect(env.RECAP_DISABLE_SET_GOAL).toBe('true')
	})

	it('should not set RECAP_DISABLE_SET_GOAL for pr loom type', () => {
		const loomPath = '/Users/test/projects/my-repo'
		const loomMetadata = createMockMetadata({ issueType: 'pr' })

		const config = generateRecapMcpConfig(loomPath, loomMetadata)

		const recapConfig = (config[0].mcpServers as Record<string, unknown>).recap as Record<string, unknown>
		const env = recapConfig.env as Record<string, string>

		expect(env.RECAP_DISABLE_SET_GOAL).toBeUndefined()
	})

	it('should not set RECAP_DISABLE_SET_GOAL for branch loom type', () => {
		const loomPath = '/Users/test/projects/my-repo'
		const loomMetadata = createMockMetadata({ issueType: 'branch' })

		const config = generateRecapMcpConfig(loomPath, loomMetadata)

		const recapConfig = (config[0].mcpServers as Record<string, unknown>).recap as Record<string, unknown>
		const env = recapConfig.env as Record<string, string>

		expect(env.RECAP_DISABLE_SET_GOAL).toBeUndefined()
	})

	it('should not set RECAP_DISABLE_SET_GOAL when issueType is null', () => {
		const loomPath = '/Users/test/projects/my-repo'
		const loomMetadata = createMockMetadata({ issueType: null })

		const config = generateRecapMcpConfig(loomPath, loomMetadata)

		const recapConfig = (config[0].mcpServers as Record<string, unknown>).recap as Record<string, unknown>
		const env = recapConfig.env as Record<string, string>

		expect(env.RECAP_DISABLE_SET_GOAL).toBeUndefined()
	})

	it('should strip trailing slashes from path', () => {
		const loomPath = '/path/to/dir/'
		const loomMetadata = createMockMetadata()

		const config = generateRecapMcpConfig(loomPath, loomMetadata)

		const recapConfig = (config[0].mcpServers as Record<string, unknown>).recap as Record<string, unknown>
		const env = recapConfig.env as Record<string, string>

		// Should not have trailing separator
		expect(env.RECAP_FILE_PATH).toContain('___path___to___dir.json')
		expect(env.RECAP_FILE_PATH).not.toContain('___path___to___dir___.json')
	})
})

describe('generateHarnessMcpConfig', () => {
	it('should generate MCP config with correct structure', () => {
		const socketPath = '/tmp/iloom-harness.sock'

		const config = generateHarnessMcpConfig(socketPath)

		expect(config).toHaveLength(1)
		expect(config[0]).toHaveProperty('mcpServers')
		expect(config[0].mcpServers).toHaveProperty('harness')
	})

	it('should set ILOOM_HARNESS_SOCKET env var to the socket path', () => {
		const socketPath = '/tmp/iloom-harness.sock'

		const config = generateHarnessMcpConfig(socketPath)

		const harnessConfig = (config[0].mcpServers as Record<string, unknown>).harness as Record<string, unknown>
		const env = harnessConfig.env as Record<string, string>

		expect(env.ILOOM_HARNESS_SOCKET).toBe(socketPath)
	})

	it('should use node as command and point to harness-server.js', () => {
		const socketPath = '/tmp/iloom-harness.sock'

		const config = generateHarnessMcpConfig(socketPath)

		const harnessConfig = (config[0].mcpServers as Record<string, unknown>).harness as Record<string, unknown>

		expect(harnessConfig.transport).toBe('stdio')
		expect(harnessConfig.command).toBe('node')
		expect(harnessConfig.args).toBeInstanceOf(Array)
		expect((harnessConfig.args as string[])[0]).toContain('harness-server.js')
	})

	it('should use different socket paths when called with different paths', () => {
		const config1 = generateHarnessMcpConfig('/tmp/socket-a.sock')
		const config2 = generateHarnessMcpConfig('/tmp/socket-b.sock')

		const env1 = ((config1[0].mcpServers as Record<string, unknown>).harness as Record<string, unknown>).env as Record<string, string>
		const env2 = ((config2[0].mcpServers as Record<string, unknown>).harness as Record<string, unknown>).env as Record<string, string>

		expect(env1.ILOOM_HARNESS_SOCKET).toBe('/tmp/socket-a.sock')
		expect(env2.ILOOM_HARNESS_SOCKET).toBe('/tmp/socket-b.sock')
	})

	it('should use absolute path for harness server JS file', () => {
		const socketPath = '/tmp/iloom-harness.sock'

		const config = generateHarnessMcpConfig(socketPath)

		const harnessConfig = (config[0].mcpServers as Record<string, unknown>).harness as Record<string, unknown>
		const serverPath = (harnessConfig.args as string[])[0]

		expect(path.isAbsolute(serverPath)).toBe(true)
	})
})

describe('generateIssueManagementMcpConfig - defaultLabels env-var bridge', () => {
	// Helpers to pull the env vars out of the generated MCP server config
	// without re-asserting the full config shape (already covered elsewhere).
	async function envForGithub(settings?: IloomSettings): Promise<Record<string, string>> {
		const cfg = await generateIssueManagementMcpConfig('issue', 'owner/repo', 'github', settings)
		const server = (cfg[0].mcpServers as Record<string, unknown>).issue_management as Record<string, unknown>
		return server.env as Record<string, string>
	}
	async function envForJira(settings: IloomSettings): Promise<Record<string, string>> {
		const cfg = await generateIssueManagementMcpConfig('issue', undefined, 'jira', settings)
		const server = (cfg[0].mcpServers as Record<string, unknown>).issue_management as Record<string, unknown>
		return server.env as Record<string, string>
	}

	it('serializes GitHub defaultLabels as a JSON array in GITHUB_DEFAULT_LABELS', async () => {
		const env = await envForGithub({
			issueManagement: {
				github: {
					remote: 'origin',
					defaultLabels: ['ai-generated', 'needs-triage'],
				},
			},
		} as IloomSettings)

		expect(env.GITHUB_DEFAULT_LABELS).toBeDefined()
		expect(JSON.parse(env.GITHUB_DEFAULT_LABELS)).toEqual(['ai-generated', 'needs-triage'])
	})

	it('omits GITHUB_DEFAULT_LABELS when defaultLabels is empty', async () => {
		const env = await envForGithub({
			issueManagement: {
				github: {
					remote: 'origin',
					defaultLabels: [],
				},
			},
		} as IloomSettings)

		expect(env.GITHUB_DEFAULT_LABELS).toBeUndefined()
	})

	it('omits GITHUB_DEFAULT_LABELS when defaultLabels is not configured', async () => {
		const env = await envForGithub(undefined)
		expect(env.GITHUB_DEFAULT_LABELS).toBeUndefined()
	})

	it('serializes Jira defaultLabels as a JSON array in JIRA_DEFAULT_LABELS', async () => {
		const env = await envForJira({
			issueManagement: {
				jira: {
					host: 'https://example.atlassian.net',
					username: 'u',
					apiToken: 't',
					projectKey: 'PROJ',
					defaultLabels: ['ai-generated', 'from-iloom'],
				},
			},
		} as IloomSettings)

		expect(env.JIRA_DEFAULT_LABELS).toBeDefined()
		expect(JSON.parse(env.JIRA_DEFAULT_LABELS)).toEqual(['ai-generated', 'from-iloom'])
	})

	it('omits JIRA_DEFAULT_LABELS when defaultLabels is empty', async () => {
		const env = await envForJira({
			issueManagement: {
				jira: {
					host: 'https://example.atlassian.net',
					username: 'u',
					apiToken: 't',
					projectKey: 'PROJ',
					defaultLabels: [],
				},
			},
		} as IloomSettings)

		expect(env.JIRA_DEFAULT_LABELS).toBeUndefined()
	})
})
