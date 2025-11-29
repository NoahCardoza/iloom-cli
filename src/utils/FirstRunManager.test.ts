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
