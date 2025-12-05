import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MetadataManager } from './MetadataManager.js'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'

// Mock fs-extra
vi.mock('fs-extra')

// Mock logger to avoid console output during tests
vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('MetadataManager', () => {
  let manager: MetadataManager
  const mockHomedir = '/Users/testuser'
  const expectedLoomsDir = '/Users/testuser/.config/iloom-ai/looms'

  beforeEach(() => {
    vi.spyOn(os, 'homedir').mockReturnValue(mockHomedir)
    manager = new MetadataManager()
  })

  describe('slugifyPath', () => {
    it('should convert absolute path to slug with double underscores', () => {
      const result = manager.slugifyPath('/Users/jane/dev/repo')
      expect(result).toBe('___Users___jane___dev___repo.json')
    })

    it('should trim trailing slashes before slugifying', () => {
      const result = manager.slugifyPath('/Users/jane/dev/repo/')
      expect(result).toBe('___Users___jane___dev___repo.json')
    })

    it('should handle multiple trailing slashes', () => {
      const result = manager.slugifyPath('/Users/jane/dev/repo///')
      expect(result).toBe('___Users___jane___dev___repo.json')
    })

    it('should replace non-alphanumeric chars (except _ and -) with hyphens', () => {
      // Spaces and special characters should become hyphens
      const result = manager.slugifyPath('/Users/jane doe/my project!')
      expect(result).toBe('___Users___jane-doe___my-project-.json')
    })

    it('should preserve underscores and hyphens in path', () => {
      const result = manager.slugifyPath('/Users/jane/my_project-v2')
      expect(result).toBe('___Users___jane___my_project-v2.json')
    })

    it('should handle Windows-style backslashes', () => {
      const result = manager.slugifyPath('C:\\Users\\jane\\dev\\repo')
      expect(result).toBe('C-___Users___jane___dev___repo.json')
    })

    it('should handle mixed path separators', () => {
      const result = manager.slugifyPath('/Users/jane\\dev/repo')
      expect(result).toBe('___Users___jane___dev___repo.json')
    })

    it('should produce consistent output for same input', () => {
      const path = '/Users/adam/Documents/Projects/my-loom'
      const result1 = manager.slugifyPath(path)
      const result2 = manager.slugifyPath(path)
      expect(result1).toBe(result2)
    })
  })

  describe('writeMetadata', () => {
    const worktreePath = '/Users/jane/dev/repo'
    const metadataInput = {
      description: 'Add dark mode toggle feature',
      branchName: 'issue-42__dark-mode',
      worktreePath: '/Users/jane/dev/repo',
      issueType: 'issue' as const,
      issue_numbers: ['42'],
      pr_numbers: [],
      issueTracker: 'github',
      colorHex: '#dcebff',
    }

    beforeEach(() => {
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)
    })

    it('should create looms directory if not exists', async () => {
      await manager.writeMetadata(worktreePath, metadataInput)

      expect(fs.ensureDir).toHaveBeenCalledWith(expectedLoomsDir, { mode: 0o755 })
    })

    it('should write JSON with all metadata fields', async () => {
      // Mock Date.now to get consistent timestamp
      const mockDate = new Date('2024-01-15T10:30:00.000Z')
      vi.setSystemTime(mockDate)

      await manager.writeMetadata(worktreePath, metadataInput)

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.json'),
        expect.stringMatching(/"description":\s*"Add dark mode toggle feature"/),
        { mode: 0o644 }
      )

      // Verify the written content structure
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
      const writtenContent = JSON.parse(writeCall?.[1] as string)
      expect(writtenContent).toMatchObject({
        description: 'Add dark mode toggle feature',
        created_at: '2024-01-15T10:30:00.000Z',
        version: 1,
        branchName: 'issue-42__dark-mode',
        worktreePath: '/Users/jane/dev/repo',
        issueType: 'issue',
        issue_numbers: ['42'],
        pr_numbers: [],
        issueTracker: 'github',
        colorHex: '#dcebff',
      })

      vi.useRealTimers()
    })

    it('should use correct filename from slugified worktree path', async () => {
      await manager.writeMetadata(worktreePath, metadataInput)

      const expectedFilename = '___Users___jane___dev___repo.json'
      const expectedPath = path.join(expectedLoomsDir, expectedFilename)
      expect(fs.writeFile).toHaveBeenCalledWith(expectedPath, expect.any(String), expect.any(Object))
    })

    it('should not throw on write error', async () => {
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Permission denied'))

      // Should not throw
      await expect(manager.writeMetadata(worktreePath, metadataInput)).resolves.not.toThrow()
    })

    it('should always include issueTracker field in written file', async () => {
      await manager.writeMetadata(worktreePath, metadataInput)

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
      const writtenContent = JSON.parse(writeCall?.[1] as string)
      expect(writtenContent.issueTracker).toBe('github')
    })
  })

  describe('readMetadata', () => {
    const worktreePath = '/Users/jane/dev/repo'

    it('should return metadata object with all fields from JSON file', async () => {
      const mockContent = JSON.stringify({
        description: 'Fix authentication bug',
        created_at: '2024-01-15T10:30:00.000Z',
        version: 1,
        branchName: 'issue-42__auth-fix',
        worktreePath: '/Users/jane/dev/repo',
        issueType: 'issue',
        issue_numbers: ['42'],
        pr_numbers: [],
        issueTracker: 'github',
        colorHex: '#f5dceb',
      })
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(mockContent)

      const result = await manager.readMetadata(worktreePath)

      expect(result).toEqual({
        description: 'Fix authentication bug',
        created_at: '2024-01-15T10:30:00.000Z',
        branchName: 'issue-42__auth-fix',
        worktreePath: '/Users/jane/dev/repo',
        issueType: 'issue',
        issue_numbers: ['42'],
        pr_numbers: [],
        issueTracker: 'github',
        colorHex: '#f5dceb',
      })
    })

    it('should return null values for missing optional fields (v1 file)', async () => {
      const mockContent = JSON.stringify({
        description: 'Fix authentication bug',
        created_at: '2024-01-15T10:30:00.000Z',
        version: 1,
      })
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(mockContent)

      const result = await manager.readMetadata(worktreePath)

      expect(result).toEqual({
        description: 'Fix authentication bug',
        created_at: '2024-01-15T10:30:00.000Z',
        branchName: null,
        worktreePath: null,
        issueType: null,
        issue_numbers: [],
        pr_numbers: [],
        issueTracker: null,
        colorHex: null,
      })
    })

    it('should return null if file does not exist', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false)

      const result = await manager.readMetadata(worktreePath)

      expect(result).toBeNull()
      expect(fs.readFile).not.toHaveBeenCalled()
    })

    it('should return null if JSON is invalid', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue('invalid json {{{')

      const result = await manager.readMetadata(worktreePath)

      expect(result).toBeNull()
    })

    it('should return null if description field is missing', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ version: 1 }))

      const result = await manager.readMetadata(worktreePath)

      expect(result).toBeNull()
    })

    it('should return null on read error', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Permission denied'))

      const result = await manager.readMetadata(worktreePath)

      expect(result).toBeNull()
    })
  })

  describe('deleteMetadata', () => {
    const worktreePath = '/Users/jane/dev/repo'

    it('should delete file if exists', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.unlink).mockResolvedValue(undefined)

      await manager.deleteMetadata(worktreePath)

      expect(fs.unlink).toHaveBeenCalledWith(
        path.join(expectedLoomsDir, '___Users___jane___dev___repo.json')
      )
    })

    it('should not throw if file does not exist (idempotent)', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false)

      await expect(manager.deleteMetadata(worktreePath)).resolves.not.toThrow()
      expect(fs.unlink).not.toHaveBeenCalled()
    })

    it('should log warning on permission error but not throw', async () => {
      const { logger } = await import('../utils/logger.js')
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.unlink).mockRejectedValue(new Error('Permission denied'))

      await expect(manager.deleteMetadata(worktreePath)).resolves.not.toThrow()
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Permission denied'))
    })
  })
})
