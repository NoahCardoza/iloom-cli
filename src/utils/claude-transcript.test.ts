import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
	getClaudeProjectPath,
	getClaudeProjectsDir,
	findSessionTranscript,
	extractCompactSummaries,
	readSessionContext,
} from './claude-transcript.js'

// Mock fs/promises
vi.mock('fs/promises', () => ({
	readFile: vi.fn(),
}))

// Mock os
vi.mock('os', () => ({
	homedir: vi.fn(() => '/Users/testuser'),
}))

import { readFile } from 'fs/promises'

describe('claude-transcript', () => {
	beforeEach(() => {
		vi.mocked(readFile).mockReset()
	})

	describe('getClaudeProjectPath', () => {
		it('should encode worktree path correctly (/ -> -)', () => {
			const path = '/Users/adam/Projects/my-project'
			const encoded = getClaudeProjectPath(path)
			expect(encoded).toBe('-Users-adam-Projects-my-project')
		})

		it('should handle paths with underscores (/ and _ -> -)', () => {
			const path = '/Users/adam/Projects/feat-issue-123__test-branch'
			const encoded = getClaudeProjectPath(path)
			expect(encoded).toBe('-Users-adam-Projects-feat-issue-123--test-branch')
		})

		it('should handle nested paths', () => {
			const path = '/home/user/deep/nested/path/to/project'
			const encoded = getClaudeProjectPath(path)
			expect(encoded).toBe('-home-user-deep-nested-path-to-project')
		})
	})

	describe('getClaudeProjectsDir', () => {
		it('should return ~/.claude/projects/ path', () => {
			const dir = getClaudeProjectsDir()
			expect(dir).toBe('/Users/testuser/.claude/projects')
		})
	})

	describe('findSessionTranscript', () => {
		it('should return correct path for worktree and sessionId', () => {
			const worktreePath = '/Users/adam/Projects/my-project'
			const sessionId = 'abc123-session-id'

			const transcriptPath = findSessionTranscript(worktreePath, sessionId)

			expect(transcriptPath).toBe(
				'/Users/testuser/.claude/projects/-Users-adam-Projects-my-project/abc123-session-id.jsonl'
			)
		})

		it('should handle paths with underscores', () => {
			const worktreePath = '/Users/adam/Projects/feat-issue-308__claude-session'
			const sessionId = 'test-session-123'

			const transcriptPath = findSessionTranscript(worktreePath, sessionId)

			expect(transcriptPath).toBe(
				'/Users/testuser/.claude/projects/-Users-adam-Projects-feat-issue-308--claude-session/test-session-123.jsonl'
			)
		})
	})

	describe('extractCompactSummaries', () => {
		it('should extract all compact summaries from transcript', async () => {
			const jsonlContent = [
				JSON.stringify({ type: 'user', message: { role: 'user', content: 'Hello' } }),
				JSON.stringify({
					type: 'user',
					isCompactSummary: true,
					message: { role: 'user', content: 'Summary 1: First compact summary content' },
				}),
				JSON.stringify({
					type: 'assistant',
					message: { role: 'assistant', content: 'Response' },
				}),
				JSON.stringify({
					type: 'user',
					isCompactSummary: true,
					message: { role: 'user', content: 'Summary 2: Second compact summary content' },
				}),
			].join('\n')

			vi.mocked(readFile).mockResolvedValue(jsonlContent)

			const summaries = await extractCompactSummaries('/path/to/transcript.jsonl')

			expect(summaries).toHaveLength(2)
			expect(summaries[0]).toBe('Summary 1: First compact summary content')
			expect(summaries[1]).toBe('Summary 2: Second compact summary content')
		})

		it('should return empty array when no compact summaries exist', async () => {
			const jsonlContent = [
				JSON.stringify({ type: 'user', message: { role: 'user', content: 'Hello' } }),
				JSON.stringify({
					type: 'assistant',
					message: { role: 'assistant', content: 'Response' },
				}),
			].join('\n')

			vi.mocked(readFile).mockResolvedValue(jsonlContent)

			const summaries = await extractCompactSummaries('/path/to/transcript.jsonl')

			expect(summaries).toHaveLength(0)
		})

		it('should parse JSONL format correctly', async () => {
			const jsonlContent = [
				JSON.stringify({
					type: 'user',
					isCompactSummary: true,
					message: { role: 'user', content: 'Test summary with "quotes" and newlines\n' },
				}),
			].join('\n')

			vi.mocked(readFile).mockResolvedValue(jsonlContent)

			const summaries = await extractCompactSummaries('/path/to/transcript.jsonl')

			expect(summaries).toHaveLength(1)
			expect(summaries[0]).toBe('Test summary with "quotes" and newlines\n')
		})

		it('should handle malformed JSON lines gracefully', async () => {
			const jsonlContent = [
				'{ this is not valid json',
				JSON.stringify({
					type: 'user',
					isCompactSummary: true,
					message: { role: 'user', content: 'Valid summary' },
				}),
				'another invalid line',
			].join('\n')

			vi.mocked(readFile).mockResolvedValue(jsonlContent)

			const summaries = await extractCompactSummaries('/path/to/transcript.jsonl')

			expect(summaries).toHaveLength(1)
			expect(summaries[0]).toBe('Valid summary')
		})

		it('should limit to most recent N summaries when specified', async () => {
			const jsonlContent = [
				JSON.stringify({
					type: 'user',
					isCompactSummary: true,
					message: { role: 'user', content: 'Summary 1' },
				}),
				JSON.stringify({
					type: 'user',
					isCompactSummary: true,
					message: { role: 'user', content: 'Summary 2' },
				}),
				JSON.stringify({
					type: 'user',
					isCompactSummary: true,
					message: { role: 'user', content: 'Summary 3' },
				}),
				JSON.stringify({
					type: 'user',
					isCompactSummary: true,
					message: { role: 'user', content: 'Summary 4' },
				}),
			].join('\n')

			vi.mocked(readFile).mockResolvedValue(jsonlContent)

			const summaries = await extractCompactSummaries('/path/to/transcript.jsonl', 2)

			expect(summaries).toHaveLength(2)
			// Should return the most recent (last) 2 summaries
			expect(summaries[0]).toBe('Summary 3')
			expect(summaries[1]).toBe('Summary 4')
		})

		it('should return empty array when transcript file not found', async () => {
			const error = new Error('ENOENT: no such file or directory') as Error & { code: string }
			error.code = 'ENOENT'
			vi.mocked(readFile).mockRejectedValue(error)

			const summaries = await extractCompactSummaries('/path/to/nonexistent.jsonl')

			expect(summaries).toHaveLength(0)
		})

		it('should handle permission errors gracefully', async () => {
			const error = new Error('EACCES: permission denied') as Error & { code: string }
			error.code = 'EACCES'
			vi.mocked(readFile).mockRejectedValue(error)

			const summaries = await extractCompactSummaries('/path/to/protected.jsonl')

			expect(summaries).toHaveLength(0)
		})

		it('should handle array content format', async () => {
			const jsonlContent = JSON.stringify({
				type: 'user',
				isCompactSummary: true,
				message: {
					role: 'user',
					content: [
						{ type: 'text', text: 'First part of summary.' },
						{ type: 'text', text: 'Second part of summary.' },
					],
				},
			})

			vi.mocked(readFile).mockResolvedValue(jsonlContent)

			const summaries = await extractCompactSummaries('/path/to/transcript.jsonl')

			expect(summaries).toHaveLength(1)
			expect(summaries[0]).toBe('First part of summary.\nSecond part of summary.')
		})
	})

	describe('readSessionContext', () => {
		it('should return compact summaries for valid session', async () => {
			const jsonlContent = [
				JSON.stringify({
					type: 'user',
					isCompactSummary: true,
					message: { role: 'user', content: 'Summary of previous work' },
				}),
			].join('\n')

			vi.mocked(readFile).mockResolvedValue(jsonlContent)

			const context = await readSessionContext('/Users/adam/Projects/test', 'session-123')

			expect(context).not.toBeNull()
			expect(context).toContain('Summary of previous work')
		})

		it('should return null when no compact summaries found', async () => {
			const jsonlContent = [
				JSON.stringify({ type: 'user', message: { role: 'user', content: 'Hello' } }),
			].join('\n')

			vi.mocked(readFile).mockResolvedValue(jsonlContent)

			const context = await readSessionContext('/Users/adam/Projects/test', 'session-123')

			expect(context).toBeNull()
		})

		it('should return null when transcript file not found', async () => {
			const error = new Error('ENOENT: no such file or directory') as Error & { code: string }
			error.code = 'ENOENT'
			vi.mocked(readFile).mockRejectedValue(error)

			const context = await readSessionContext('/Users/adam/Projects/test', 'session-123')

			expect(context).toBeNull()
		})

		it('should format multiple summaries with separators', async () => {
			const jsonlContent = [
				JSON.stringify({
					type: 'user',
					isCompactSummary: true,
					message: { role: 'user', content: 'First summary' },
				}),
				JSON.stringify({
					type: 'user',
					isCompactSummary: true,
					message: { role: 'user', content: 'Second summary' },
				}),
			].join('\n')

			vi.mocked(readFile).mockResolvedValue(jsonlContent)

			const context = await readSessionContext('/Users/adam/Projects/test', 'session-123')

			expect(context).not.toBeNull()
			// Should have headers for multiple summaries (newest first after reverse)
			expect(context).toContain('### Compact Summary 1 of 2')
			expect(context).toContain('### Compact Summary 2 of 2')
			expect(context).toContain('---')
			// Second summary should appear first (reversed order - newest first)
			expect(context!.indexOf('Second summary')).toBeLessThan(
				context!.indexOf('First summary')
			)
		})

		it('should not include headers for single summary', async () => {
			const jsonlContent = JSON.stringify({
				type: 'user',
				isCompactSummary: true,
				message: { role: 'user', content: 'Only summary' },
			})

			vi.mocked(readFile).mockResolvedValue(jsonlContent)

			const context = await readSessionContext('/Users/adam/Projects/test', 'session-123')

			expect(context).not.toBeNull()
			expect(context).toBe('Only summary')
			expect(context).not.toContain('### Compact Summary')
		})
	})
})
