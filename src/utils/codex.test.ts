import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execa } from 'execa'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { detectCodexCli, launchCodex } from './codex.js'

vi.mock('execa')
vi.mock('node:fs/promises')
vi.mock('./logger.js', () => ({
	logger: {
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	},
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockExeca = () => vi.mocked(execa) as any

describe('codex utils', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe('detectCodexCli', () => {
		it('returns true when Codex CLI is found', async () => {
			mockExeca().mockResolvedValueOnce({ stdout: '/usr/local/bin/codex', exitCode: 0 })

			const result = await detectCodexCli()

			expect(result).toBe(true)
			expect(execa).toHaveBeenCalledWith('command', ['-v', 'codex'], {
				shell: true,
				timeout: 5000,
			})
		})

		it('returns false when Codex CLI is missing', async () => {
			mockExeca().mockRejectedValueOnce(new Error('missing'))

			const result = await detectCodexCli()

			expect(result).toBe(false)
		})
	})

	describe('launchCodex', () => {
		it('launches headless Codex with output file and MCP config overrides', async () => {
			vi.mocked(mkdtemp).mockResolvedValueOnce('/tmp/iloom-codex-abc')
			vi.mocked(readFile).mockResolvedValueOnce('planned output')
			vi.mocked(rm).mockResolvedValue(undefined)
			mockExeca().mockResolvedValueOnce({ stdout: '', exitCode: 0 })

			const result = await launchCodex('Plan this feature', {
				headless: true,
				fullAuto: true,
				appendSystemPrompt: 'System instructions',
				workingDirectory: '/repo',
				addDirs: ['/tmp'],
				mcpConfig: [
					{
						mcpServers: {
							issue_management: {
								command: 'node',
								args: ['/repo/dist/mcp/issue-management-server.js'],
								env: {
									ISSUE_PROVIDER: 'github',
									REPO_OWNER: 'iloom-ai',
								},
							},
						},
					},
				],
			})

			expect(result).toBe('planned output')
			expect(execa).toHaveBeenCalledWith(
				'codex',
				expect.arrayContaining([
					'exec',
					'--full-auto',
					'-C',
					'/repo',
					'--add-dir',
					'/tmp',
					'-o',
					'/tmp/iloom-codex-abc/last-message.txt',
					'-c',
					'mcp_servers.issue_management.command="node"',
					'-c',
					'mcp_servers.issue_management.args=["/repo/dist/mcp/issue-management-server.js"]',
					'-c',
					'mcp_servers.issue_management.env.ISSUE_PROVIDER="github"',
					'-c',
					'mcp_servers.issue_management.env.REPO_OWNER="iloom-ai"',
					'--',
					'-',
				]),
				expect.objectContaining({
					cwd: '/repo',
					timeout: 0,
					input: expect.stringContaining('<planning_instructions>'),
				})
			)
			const args = mockExeca().mock.calls[0][1] as string[]
			expect(args.some(arg => arg.includes('Plan this feature'))).toBe(false)
			expect(readFile).toHaveBeenCalledWith('/tmp/iloom-codex-abc/last-message.txt', 'utf-8')
			expect(rm).toHaveBeenCalledWith('/tmp/iloom-codex-abc', { recursive: true, force: true })
		})

		it('streams JSONL to stdout in passthrough mode and still returns the last message', async () => {
			vi.mocked(mkdtemp).mockResolvedValueOnce('/tmp/iloom-codex-stream')
			vi.mocked(readFile).mockResolvedValueOnce('final streamed output')
			vi.mocked(rm).mockResolvedValue(undefined)
			mockExeca().mockResolvedValueOnce({ stdout: '', exitCode: 0 })

			const result = await launchCodex('Plan this feature', {
				headless: true,
				fullAuto: true,
				jsonMode: 'stream',
				passthroughStdout: true,
				workingDirectory: '/repo',
			})

			expect(result).toBe('final streamed output')
			expect(execa).toHaveBeenCalledWith(
				'codex',
				expect.arrayContaining(['exec', '--full-auto', '-C', '/repo', '--json']),
				expect.objectContaining({
					cwd: '/repo',
					stdio: ['pipe', 'inherit', 'pipe'],
					input: 'Plan this feature',
				})
			)
		})

		it('launches interactive Codex with approval policy and sandbox settings', async () => {
			mockExeca().mockResolvedValueOnce({ stdout: '', exitCode: 0 })

			await launchCodex('Plan this feature', {
				headless: false,
				sandbox: 'workspace-write',
				approvalPolicy: 'never',
				appendSystemPrompt: 'System instructions',
				workingDirectory: '/repo',
				addDirs: ['/tmp'],
			})

			expect(execa).toHaveBeenCalledWith(
				'codex',
				expect.arrayContaining([
					'-s',
					'workspace-write',
					'-a',
					'never',
					'-C',
					'/repo',
					'--add-dir',
					'/tmp',
					'--',
					expect.stringContaining('<planning_instructions>'),
				]),
				expect.objectContaining({
					cwd: '/repo',
					stdio: 'inherit',
					timeout: 0,
				})
			)
		})

	})
})
