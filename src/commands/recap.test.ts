import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RecapCommand, type RecapCommandInput } from './recap.js'
import type { RecapOutput } from '../mcp/recap-types.js'

// Mock fs-extra
vi.mock('fs-extra', () => ({
	default: {
		pathExists: vi.fn(),
		readFile: vi.fn(),
	},
}))

import fs from 'fs-extra'

describe('RecapCommand', () => {
	let command: RecapCommand

	beforeEach(() => {
		command = new RecapCommand()
	})

	describe('execute with JSON mode', () => {
		it('should return RecapOutput with filePath, goal, and entries when recap file exists', async () => {
			const mockRecap = {
				goal: 'Implement feature X',
				entries: [
					{ id: 'uuid-1', timestamp: '2025-01-01T00:00:00Z', type: 'decision', content: 'Use TypeScript' },
					{ id: 'uuid-2', timestamp: '2025-01-01T00:01:00Z', type: 'insight', content: 'Found helper function' },
				],
			}

			vi.mocked(fs.pathExists).mockResolvedValue(true as never)
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockRecap) as never)

			const input: RecapCommandInput = { json: true }
			const result = await command.execute(input) as RecapOutput

			expect(result).toBeDefined()
			expect(result.goal).toBe('Implement feature X')
			expect(result.entries).toHaveLength(2)
			expect(result.entries[0].type).toBe('decision')
			expect(result.entries[1].type).toBe('insight')
			expect(result.filePath).toContain('.config/iloom-ai/recaps/')
			expect(result.filePath).toMatch(/\.json$/)
		})

		it('should return empty recap when file does not exist', async () => {
			vi.mocked(fs.pathExists).mockResolvedValue(false as never)

			const input: RecapCommandInput = { json: true }
			const result = await command.execute(input) as RecapOutput

			expect(result).toBeDefined()
			expect(result.goal).toBeNull()
			expect(result.entries).toHaveLength(0)
			expect(result.filePath).toContain('.config/iloom-ai/recaps/')
		})

		it('should return empty recap when file has invalid JSON', async () => {
			vi.mocked(fs.pathExists).mockResolvedValue(true as never)
			vi.mocked(fs.readFile).mockResolvedValue('invalid json {{{' as never)

			const input: RecapCommandInput = { json: true }
			const result = await command.execute(input) as RecapOutput

			expect(result).toBeDefined()
			expect(result.goal).toBeNull()
			expect(result.entries).toHaveLength(0)
		})

		it('should derive filePath from current working directory using slugifyPath algorithm', async () => {
			vi.mocked(fs.pathExists).mockResolvedValue(false as never)

			// Mock process.cwd
			const originalCwd = process.cwd
			process.cwd = vi.fn().mockReturnValue('/Users/test/projects/my-repo')

			const input: RecapCommandInput = { json: true }
			const result = await command.execute(input) as RecapOutput

			// The path should be slugified: /Users/test/projects/my-repo -> ___Users___test___projects___my-repo.json
			expect(result.filePath).toContain('___Users___test___projects___my-repo.json')

			process.cwd = originalCwd
		})
	})

	describe('execute without JSON mode', () => {
		it('should print human-readable output to console', async () => {
			const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

			const mockRecap = {
				goal: 'Test goal',
				entries: [
					{ id: 'uuid-1', timestamp: '2025-01-01T00:00:00Z', type: 'decision', content: 'Test decision' },
				],
			}

			vi.mocked(fs.pathExists).mockResolvedValue(true as never)
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockRecap) as never)

			const input: RecapCommandInput = { json: false }
			const result = await command.execute(input)

			expect(result).toBeUndefined()
			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Recap file:'))
			expect(consoleSpy).toHaveBeenCalledWith('Goal: Test goal')
			expect(consoleSpy).toHaveBeenCalledWith('Entries: 1')
			expect(consoleSpy).toHaveBeenCalledWith('  [decision] Test decision')

			consoleSpy.mockRestore()
		})

		it('should print (not set) when goal is null', async () => {
			const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

			vi.mocked(fs.pathExists).mockResolvedValue(false as never)

			const input: RecapCommandInput = { json: false }
			await command.execute(input)

			expect(consoleSpy).toHaveBeenCalledWith('Goal: (not set)')
			expect(consoleSpy).toHaveBeenCalledWith('Entries: 0')

			consoleSpy.mockRestore()
		})
	})

	describe('filePath derivation', () => {
		it('should use the same slugifyPath algorithm as MetadataManager', async () => {
			vi.mocked(fs.pathExists).mockResolvedValue(false as never)

			// Test with a path that has special characters
			const originalCwd = process.cwd
			process.cwd = vi.fn().mockReturnValue('/path/with spaces/and.dots')

			const input: RecapCommandInput = { json: true }
			const result = await command.execute(input) as RecapOutput

			// Path separators become ___, special chars become -
			expect(result.filePath).toContain('___path___with-spaces___and-dots.json')

			process.cwd = originalCwd
		})

		it('should handle Windows-style paths', async () => {
			vi.mocked(fs.pathExists).mockResolvedValue(false as never)

			// Test with a Windows-style path (simulated)
			const originalCwd = process.cwd
			process.cwd = vi.fn().mockReturnValue('C:\\Users\\test\\projects')

			const input: RecapCommandInput = { json: true }
			const result = await command.execute(input) as RecapOutput

			// Path separators (both / and \) become ___
			expect(result.filePath).toContain('C-___Users___test___projects.json')

			process.cwd = originalCwd
		})

		it('should strip trailing slashes', async () => {
			vi.mocked(fs.pathExists).mockResolvedValue(false as never)

			const originalCwd = process.cwd
			process.cwd = vi.fn().mockReturnValue('/path/to/dir/')

			const input: RecapCommandInput = { json: true }
			const result = await command.execute(input) as RecapOutput

			// Trailing slash should be stripped before slugification
			expect(result.filePath).toContain('___path___to___dir.json')
			expect(result.filePath).not.toContain('___path___to___dir___.json')

			process.cwd = originalCwd
		})
	})
})
