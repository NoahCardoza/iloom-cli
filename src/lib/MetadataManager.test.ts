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
      sessionId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
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
        sessionId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
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

    it('should write sessionId to JSON file', async () => {
      await manager.writeMetadata(worktreePath, metadataInput)

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
      const writtenContent = JSON.parse(writeCall?.[1] as string)
      expect(writtenContent.sessionId).toBe('6ba7b810-9dad-11d1-80b4-00c04fd430c8')
    })

    it('should write parentLoom fields when provided', async () => {
      const inputWithParent = {
        ...metadataInput,
        parentLoom: {
          type: 'issue' as const,
          identifier: 100,
          branchName: 'issue-100__parent-feature',
          worktreePath: '/Users/jane/dev/parent-repo',
          databaseBranch: 'db-branch-100',
        },
      }

      await manager.writeMetadata(worktreePath, inputWithParent)

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
      const writtenContent = JSON.parse(writeCall?.[1] as string)
      expect(writtenContent.parentLoom).toEqual({
        type: 'issue',
        identifier: 100,
        branchName: 'issue-100__parent-feature',
        worktreePath: '/Users/jane/dev/parent-repo',
        databaseBranch: 'db-branch-100',
      })
    })

    it('should not include parentLoom field when not provided', async () => {
      await manager.writeMetadata(worktreePath, metadataInput)

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
      const writtenContent = JSON.parse(writeCall?.[1] as string)
      expect(writtenContent.parentLoom).toBeUndefined()
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
        sessionId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
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
        sessionId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        parentLoom: null,
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
        sessionId: null,
        parentLoom: null,
      })
    })

    it('should return null sessionId for legacy files without sessionId', async () => {
      const mockContent = JSON.stringify({
        description: 'Legacy loom without sessionId',
        created_at: '2024-01-15T10:30:00.000Z',
        version: 1,
        branchName: 'issue-42__legacy',
        worktreePath: '/Users/jane/dev/repo',
        issueType: 'issue',
        issue_numbers: ['42'],
        pr_numbers: [],
        issueTracker: 'github',
        colorHex: '#f5dceb',
        // Note: no sessionId field
      })
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(mockContent)

      const result = await manager.readMetadata(worktreePath)

      expect(result?.sessionId).toBeNull()
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

    it('should return parentLoom when present in metadata file', async () => {
      const mockContent = JSON.stringify({
        description: 'Child loom with parent',
        created_at: '2024-01-15T10:30:00.000Z',
        version: 1,
        branchName: 'issue-200__child-feature',
        worktreePath: '/Users/jane/dev/child-repo',
        issueType: 'issue',
        issue_numbers: ['200'],
        pr_numbers: [],
        issueTracker: 'github',
        colorHex: '#f5dceb',
        sessionId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        parentLoom: {
          type: 'issue',
          identifier: 100,
          branchName: 'issue-100__parent-feature',
          worktreePath: '/Users/jane/dev/parent-repo',
          databaseBranch: 'db-branch-100',
        },
      })
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(mockContent)

      const result = await manager.readMetadata(worktreePath)

      expect(result?.parentLoom).toEqual({
        type: 'issue',
        identifier: 100,
        branchName: 'issue-100__parent-feature',
        worktreePath: '/Users/jane/dev/parent-repo',
        databaseBranch: 'db-branch-100',
      })
    })

    it('should return null parentLoom for non-child looms', async () => {
      const mockContent = JSON.stringify({
        description: 'Regular loom without parent',
        created_at: '2024-01-15T10:30:00.000Z',
        version: 1,
        branchName: 'issue-42__feature',
        worktreePath: '/Users/jane/dev/repo',
        issueType: 'issue',
        issue_numbers: ['42'],
        pr_numbers: [],
        issueTracker: 'github',
        colorHex: '#f5dceb',
        sessionId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        // Note: no parentLoom field
      })
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(mockContent)

      const result = await manager.readMetadata(worktreePath)

      expect(result?.parentLoom).toBeNull()
    })
  })

  describe('listAllMetadata', () => {
    it('should return empty array when looms directory does not exist', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false)

      const result = await manager.listAllMetadata()

      expect(result).toEqual([])
      expect(fs.readdir).not.toHaveBeenCalled()
    })

    it('should return empty array when looms directory is empty', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readdir).mockResolvedValue([])

      const result = await manager.listAllMetadata()

      expect(result).toEqual([])
    })

    it('should return metadata from all valid JSON files', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readdir).mockResolvedValue([
        '___Users___alice___project1.json',
        '___Users___bob___project2.json',
      ] as unknown as string[])

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const path = String(filePath)
        if (path.includes('project1')) {
          return JSON.stringify({
            description: 'Project 1 loom',
            created_at: '2024-01-15T10:00:00.000Z',
            version: 1,
            branchName: 'issue-1__feat',
            worktreePath: '/Users/alice/project1',
            issueType: 'issue',
            issue_numbers: ['1'],
            pr_numbers: [],
            issueTracker: 'github',
            colorHex: '#ff0000',
            sessionId: '11111111-1111-1111-1111-111111111111',
          })
        }
        return JSON.stringify({
          description: 'Project 2 loom',
          created_at: '2024-01-16T10:00:00.000Z',
          version: 1,
          branchName: 'issue-2__fix',
          worktreePath: '/Users/bob/project2',
          issueType: 'issue',
          issue_numbers: ['2'],
          pr_numbers: [],
          issueTracker: 'github',
          colorHex: '#00ff00',
          sessionId: '22222222-2222-2222-2222-222222222222',
        })
      })

      const result = await manager.listAllMetadata()

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        description: 'Project 1 loom',
        created_at: '2024-01-15T10:00:00.000Z',
        branchName: 'issue-1__feat',
        worktreePath: '/Users/alice/project1',
        issueType: 'issue',
        issue_numbers: ['1'],
        pr_numbers: [],
        issueTracker: 'github',
        colorHex: '#ff0000',
        sessionId: '11111111-1111-1111-1111-111111111111',
        parentLoom: null,
      })
      expect(result[1]).toEqual({
        description: 'Project 2 loom',
        created_at: '2024-01-16T10:00:00.000Z',
        branchName: 'issue-2__fix',
        worktreePath: '/Users/bob/project2',
        issueType: 'issue',
        issue_numbers: ['2'],
        pr_numbers: [],
        issueTracker: 'github',
        colorHex: '#00ff00',
        sessionId: '22222222-2222-2222-2222-222222222222',
        parentLoom: null,
      })
    })

    it('should skip non-JSON files', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readdir).mockResolvedValue([
        '___Users___alice___project1.json',
        'readme.txt',
        '.DS_Store',
      ] as unknown as string[])

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        description: 'Project 1 loom',
        version: 1,
        colorHex: '#ff0000',
      }))

      const result = await manager.listAllMetadata()

      expect(result).toHaveLength(1)
      expect(fs.readFile).toHaveBeenCalledTimes(1)
    })

    it('should skip files with invalid JSON', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readdir).mockResolvedValue([
        'valid.json',
        'invalid.json',
      ] as unknown as string[])

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const path = String(filePath)
        if (path.includes('invalid')) {
          return 'not valid json {'
        }
        return JSON.stringify({
          description: 'Valid loom',
          version: 1,
          colorHex: '#ff0000',
        })
      })

      const result = await manager.listAllMetadata()

      expect(result).toHaveLength(1)
      expect(result[0].description).toBe('Valid loom')
    })

    it('should skip files without description field', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readdir).mockResolvedValue([
        'with-desc.json',
        'no-desc.json',
      ] as unknown as string[])

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const path = String(filePath)
        if (path.includes('no-desc')) {
          return JSON.stringify({ version: 1, colorHex: '#ff0000' })
        }
        return JSON.stringify({
          description: 'Has description',
          version: 1,
          colorHex: '#00ff00',
        })
      })

      const result = await manager.listAllMetadata()

      expect(result).toHaveLength(1)
      expect(result[0].description).toBe('Has description')
    })

    it('should return null values for missing optional fields', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readdir).mockResolvedValue(['minimal.json'] as unknown as string[])

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        description: 'Minimal loom',
        version: 1,
      }))

      const result = await manager.listAllMetadata()

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        description: 'Minimal loom',
        created_at: null,
        branchName: null,
        worktreePath: null,
        issueType: null,
        issue_numbers: [],
        pr_numbers: [],
        issueTracker: null,
        colorHex: null,
        sessionId: null,
        parentLoom: null,
      })
    })

    it('should include parentLoom in listed metadata', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readdir).mockResolvedValue(['child-loom.json'] as unknown as string[])

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        description: 'Child loom',
        created_at: '2024-01-15T10:00:00.000Z',
        version: 1,
        branchName: 'issue-200__child',
        worktreePath: '/Users/alice/child-project',
        issueType: 'issue',
        issue_numbers: ['200'],
        pr_numbers: [],
        issueTracker: 'github',
        colorHex: '#ff0000',
        sessionId: '33333333-3333-3333-3333-333333333333',
        parentLoom: {
          type: 'issue',
          identifier: 100,
          branchName: 'issue-100__parent',
          worktreePath: '/Users/alice/parent-project',
          databaseBranch: 'db-branch-100',
        },
      }))

      const result = await manager.listAllMetadata()

      expect(result).toHaveLength(1)
      expect(result[0].parentLoom).toEqual({
        type: 'issue',
        identifier: 100,
        branchName: 'issue-100__parent',
        worktreePath: '/Users/alice/parent-project',
        databaseBranch: 'db-branch-100',
      })
    })

    it('should handle readdir error gracefully', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readdir).mockRejectedValue(new Error('Permission denied'))

      const result = await manager.listAllMetadata()

      expect(result).toEqual([])
    })

    it('should continue reading other files when one file read fails', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readdir).mockResolvedValue([
        'good1.json',
        'bad.json',
        'good2.json',
      ] as unknown as string[])

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const path = String(filePath)
        if (path.includes('bad')) {
          throw new Error('Permission denied')
        }
        if (path.includes('good1')) {
          return JSON.stringify({ description: 'Good 1', version: 1, colorHex: '#111111' })
        }
        return JSON.stringify({ description: 'Good 2', version: 1, colorHex: '#222222' })
      })

      const result = await manager.listAllMetadata()

      expect(result).toHaveLength(2)
      expect(result.map(r => r.description)).toEqual(['Good 1', 'Good 2'])
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
