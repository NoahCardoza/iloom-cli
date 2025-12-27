import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FirstRunManager } from './FirstRunManager.js'
import fs from 'fs-extra'
import os from 'os'

// Mock dependencies
vi.mock('fs-extra')
vi.mock('os')

describe('FirstRunManager', () => {
	beforeEach(() => {
		// Mock os.homedir()
		vi.mocked(os.homedir).mockReturnValue('/home/user')
		// Default mock for fs.realpath - passthrough behavior (no symlink resolution)
		vi.mocked(fs.realpath).mockImplementation(async (p) => String(p))
	})

	describe('isFirstRun', () => {
		it('returns true when marker file does not exist', async () => {
			const manager = new FirstRunManager('spin')

			// Mock marker file does not exist
			vi.mocked(fs.pathExists).mockResolvedValue(false)

			const result = await manager.isFirstRun()

			expect(result).toBe(true)
			expect(fs.pathExists).toHaveBeenCalledWith('/home/user/.config/iloom-ai/spin-first-run')
		})

		it('returns false when marker file exists', async () => {
			const manager = new FirstRunManager('spin')

			// Mock marker file exists
			vi.mocked(fs.pathExists).mockResolvedValue(true)

			const result = await manager.isFirstRun()

			expect(result).toBe(false)
			expect(fs.pathExists).toHaveBeenCalledWith('/home/user/.config/iloom-ai/spin-first-run')
		})

		it('returns true on file read errors (graceful degradation)', async () => {
			const manager = new FirstRunManager('spin')

			// Mock pathExists throwing an error
			vi.mocked(fs.pathExists).mockRejectedValue(new Error('Permission denied'))

			const result = await manager.isFirstRun()

			// Should gracefully degrade by treating as first-run
			expect(result).toBe(true)
		})

		it('uses custom feature name in marker file path', async () => {
			const manager = new FirstRunManager('test-feature')

			vi.mocked(fs.pathExists).mockResolvedValue(false)

			await manager.isFirstRun()

			expect(fs.pathExists).toHaveBeenCalledWith('/home/user/.config/iloom-ai/test-feature-first-run')
		})
	})

	describe('isProjectConfigured', () => {
		it('returns false when project marker file does not exist', async () => {
			const manager = new FirstRunManager()

			vi.mocked(fs.pathExists).mockResolvedValue(false)

			const result = await manager.isProjectConfigured('/Users/adam/Projects/my-app')

			expect(result).toBe(false)
			expect(fs.pathExists).toHaveBeenCalledWith(
				'/home/user/.config/iloom-ai/projects/Users__adam__Projects__my-app'
			)
		})

		it('returns true when project marker file exists', async () => {
			const manager = new FirstRunManager()

			vi.mocked(fs.pathExists).mockResolvedValue(true)

			const result = await manager.isProjectConfigured('/Users/adam/Projects/my-app')

			expect(result).toBe(true)
		})

		it('returns false on file read errors (allows wizard to run)', async () => {
			const manager = new FirstRunManager()

			vi.mocked(fs.pathExists).mockRejectedValue(new Error('Permission denied'))

			const result = await manager.isProjectConfigured('/some/path')

			expect(result).toBe(false)
		})

		it('uses process.cwd() when no path provided', async () => {
			const manager = new FirstRunManager()
			const originalCwd = process.cwd

			// Mock process.cwd
			process.cwd = () => '/mocked/cwd/path'
			vi.mocked(fs.pathExists).mockResolvedValue(true)

			const result = await manager.isProjectConfigured()

			expect(result).toBe(true)
			expect(fs.pathExists).toHaveBeenCalledWith(
				'/home/user/.config/iloom-ai/projects/mocked__cwd__path'
			)

			// Restore
			process.cwd = originalCwd
		})
	})

	describe('markProjectAsConfigured', () => {
		it('creates marker file in projects directory', async () => {
			const manager = new FirstRunManager()

			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)

			await manager.markProjectAsConfigured('/Users/adam/Projects/my-app')

			expect(fs.ensureDir).toHaveBeenCalledWith('/home/user/.config/iloom-ai/projects')
			expect(fs.writeFile).toHaveBeenCalledWith(
				'/home/user/.config/iloom-ai/projects/Users__adam__Projects__my-app',
				expect.any(String),
				'utf8'
			)
		})

		it('writes JSON marker file with project metadata', async () => {
			const manager = new FirstRunManager()

			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)

			await manager.markProjectAsConfigured('/Users/adam/Projects/my-app')

			const calls = vi.mocked(fs.writeFile).mock.calls
			expect(calls.length).toBeGreaterThan(0)
			const [, jsonContent] = calls[0]
			const parsed = JSON.parse(String(jsonContent))

			expect(parsed).toHaveProperty('configuredAt')
			expect(parsed.projectPath).toBe('/Users/adam/Projects/my-app')
			expect(parsed.projectName).toBe('my-app')
		})

		it('handles write errors gracefully without throwing', async () => {
			const manager = new FirstRunManager()

			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockRejectedValue(new Error('Disk full'))

			await expect(manager.markProjectAsConfigured('/some/path')).resolves.toBeUndefined()
		})

		it('uses process.cwd() when no path provided', async () => {
			const manager = new FirstRunManager()
			const originalCwd = process.cwd

			process.cwd = () => '/mocked/cwd/path'
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)

			await manager.markProjectAsConfigured()

			expect(fs.writeFile).toHaveBeenCalledWith(
				'/home/user/.config/iloom-ai/projects/mocked__cwd__path',
				expect.any(String),
				'utf8'
			)

			process.cwd = originalCwd
		})
	})

	describe('symlink resolution', () => {
		describe('isProjectConfigured', () => {
			it('resolves symlinks before checking marker file', async () => {
				const manager = new FirstRunManager()

				// Mock fs.realpath to return resolved path
				vi.mocked(fs.realpath).mockResolvedValue('/real/path/to/project')
				vi.mocked(fs.pathExists).mockResolvedValue(true)

				const result = await manager.isProjectConfigured('/symlink/path/to/project')

				expect(result).toBe(true)
				expect(fs.realpath).toHaveBeenCalledWith('/symlink/path/to/project')
				expect(fs.pathExists).toHaveBeenCalledWith(
					'/home/user/.config/iloom-ai/projects/real__path__to__project'
				)
			})

			it('falls back to original path when symlink resolution fails', async () => {
				const manager = new FirstRunManager()

				// Mock fs.realpath to reject
				vi.mocked(fs.realpath).mockRejectedValue(new Error('ENOENT: no such file or directory'))
				vi.mocked(fs.pathExists).mockResolvedValue(true)

				const result = await manager.isProjectConfigured('/broken/symlink/path')

				expect(result).toBe(true)
				// Should fall back to original path
				expect(fs.pathExists).toHaveBeenCalledWith(
					'/home/user/.config/iloom-ai/projects/broken__symlink__path'
				)
			})
		})

		describe('markProjectAsConfigured', () => {
			it('stores resolved path in marker file content', async () => {
				const manager = new FirstRunManager()

				// Mock fs.realpath to return resolved path
				vi.mocked(fs.realpath).mockResolvedValue('/real/path/to/project')
				vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
				vi.mocked(fs.writeFile).mockResolvedValue(undefined)

				await manager.markProjectAsConfigured('/symlink/path/to/project')

				expect(fs.realpath).toHaveBeenCalledWith('/symlink/path/to/project')
				// Verify marker filename uses resolved path
				expect(fs.writeFile).toHaveBeenCalledWith(
					'/home/user/.config/iloom-ai/projects/real__path__to__project',
					expect.any(String),
					'utf8'
				)

				// Verify projectPath in marker content uses resolved path
				const calls = vi.mocked(fs.writeFile).mock.calls
				const [, jsonContent] = calls[0]
				const parsed = JSON.parse(String(jsonContent))
				expect(parsed.projectPath).toBe('/real/path/to/project')
			})

			it('falls back to original path when symlink resolution fails', async () => {
				const manager = new FirstRunManager()

				// Mock fs.realpath to reject
				vi.mocked(fs.realpath).mockRejectedValue(new Error('ENOENT'))
				vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
				vi.mocked(fs.writeFile).mockResolvedValue(undefined)

				await manager.markProjectAsConfigured('/broken/symlink')

				// Should use original path
				expect(fs.writeFile).toHaveBeenCalledWith(
					'/home/user/.config/iloom-ai/projects/broken__symlink',
					expect.any(String),
					'utf8'
				)
			})
		})
	})

	describe('markAsRun', () => {
		it('creates marker file in config directory', async () => {
			const manager = new FirstRunManager('spin')

			// Mock successful directory and file creation
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)

			await manager.markAsRun()

			expect(fs.ensureDir).toHaveBeenCalledWith('/home/user/.config/iloom-ai')
			expect(fs.writeFile).toHaveBeenCalledWith(
				'/home/user/.config/iloom-ai/spin-first-run',
				expect.stringContaining('firstRun'),
				'utf8'
			)
		})

		it('creates config directory if it does not exist', async () => {
			const manager = new FirstRunManager('spin')

			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)

			await manager.markAsRun()

			// Should call ensureDir to create directory
			expect(fs.ensureDir).toHaveBeenCalledWith('/home/user/.config/iloom-ai')
		})

		it('handles write errors gracefully without throwing', async () => {
			const manager = new FirstRunManager('spin')

			// Mock ensureDir succeeding but writeFile failing
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockRejectedValue(new Error('Disk full'))

			// Should not throw
			await expect(manager.markAsRun()).resolves.toBeUndefined()
		})

		it('handles directory creation errors gracefully', async () => {
			const manager = new FirstRunManager('spin')

			// Mock ensureDir failing
			vi.mocked(fs.ensureDir).mockRejectedValue(new Error('Permission denied'))

			// Should not throw
			await expect(manager.markAsRun()).resolves.toBeUndefined()
		})

		it('writes JSON marker file with timestamp', async () => {
			const manager = new FirstRunManager('spin')

			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)

			await manager.markAsRun()

			// Check that writeFile was called with JSON content
			const calls = vi.mocked(fs.writeFile).mock.calls
			expect(calls.length).toBeGreaterThan(0)
			const [filePath, jsonContent, encoding] = calls[0]
			expect(String(filePath)).toContain('spin-first-run')
			expect(String(jsonContent)).toContain('firstRun')
			expect(encoding).toBe('utf8')

			// Validate it's valid JSON
			expect(() => JSON.parse(String(jsonContent))).not.toThrow()
		})
	})
})
