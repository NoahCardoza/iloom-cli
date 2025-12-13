import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'
import os from 'os'

// Mock fs-extra
vi.mock('fs-extra')

// Mock logger-context
vi.mock('../utils/logger-context.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// Mock MetadataManager (needed for type imports)
vi.mock('../lib/MetadataManager.js', () => ({
  MetadataManager: vi.fn().mockImplementation(() => ({
    listAllMetadata: vi.fn().mockResolvedValue([]),
  })),
}))

import fs from 'fs-extra'
import { ProjectsCommand } from './projects.js'
import { MetadataManager, type LoomMetadata } from '../lib/MetadataManager.js'

describe('ProjectsCommand', () => {
  const mockHomedir = '/home/user'
  let projectsDir: string

  // Helper to create a mock metadata manager
  const createMockMetadataManager = (metadata: LoomMetadata[] = []) => ({
    listAllMetadata: vi.fn().mockResolvedValue(metadata),
  })

  beforeEach(() => {
    vi.spyOn(os, 'homedir').mockReturnValue(mockHomedir)
    projectsDir = path.join(os.homedir(), '.config', 'iloom-ai', 'projects')
  })

  describe('execute', () => {
    it('returns empty array when projects directory does not exist', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false)

      const command = new ProjectsCommand(createMockMetadataManager() as unknown as MetadataManager)
      const result = await command.execute()

      expect(result).toEqual([])
      expect(fs.pathExists).toHaveBeenCalledWith(projectsDir)
    })

    it('returns projects with metadata when directory exists', async () => {
      vi.mocked(fs.pathExists).mockImplementation(async (p) => {
        const pathStr = p.toString()
        if (pathStr === projectsDir) return true
        if (pathStr === '/Users/adam/Documents/Projects/project-a') return true
        if (pathStr === '/Users/adam/Documents/Projects/project-b') return true
        return false
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(fs.readdir).mockResolvedValue(['project-a-marker', 'project-b-marker'] as any)

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const filePathStr = filePath.toString()
        if (filePathStr.includes('project-a-marker')) {
          return JSON.stringify({
            configuredAt: '2025-12-05T22:59:58.488Z',
            projectPath: '/Users/adam/Documents/Projects/project-a',
            projectName: 'project-a',
          })
        }
        if (filePathStr.includes('project-b-marker')) {
          return JSON.stringify({
            configuredAt: '2025-12-05T17:09:00.000Z',
            projectPath: '/Users/adam/Documents/Projects/project-b',
            projectName: 'project-b',
          })
        }
        throw new Error('File not found')
      })

      const command = new ProjectsCommand(createMockMetadataManager() as unknown as MetadataManager)
      const result = await command.execute()

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        configuredAt: '2025-12-05T22:59:58.488Z',
        projectPath: '/Users/adam/Documents/Projects/project-a',
        projectName: 'project-a',
        activeLooms: 0,
      })
      expect(result[1]).toEqual({
        configuredAt: '2025-12-05T17:09:00.000Z',
        projectPath: '/Users/adam/Documents/Projects/project-b',
        projectName: 'project-b',
        activeLooms: 0,
      })
    })

    it('filters out projects where directory no longer exists', async () => {
      vi.mocked(fs.pathExists).mockImplementation(async (p) => {
        const pathStr = p.toString()
        if (pathStr === projectsDir) return true
        if (pathStr === '/Users/adam/Documents/Projects/project-a') return true
        if (pathStr === '/Users/adam/Documents/Projects/project-b') return false
        return false
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(fs.readdir).mockResolvedValue(['project-a-marker', 'project-b-marker'] as any)

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const filePathStr = filePath.toString()
        if (filePathStr.includes('project-a-marker')) {
          return JSON.stringify({
            configuredAt: '2025-12-05T22:59:58.488Z',
            projectPath: '/Users/adam/Documents/Projects/project-a',
            projectName: 'project-a',
          })
        }
        if (filePathStr.includes('project-b-marker')) {
          return JSON.stringify({
            configuredAt: '2025-12-05T17:09:00.000Z',
            projectPath: '/Users/adam/Documents/Projects/project-b',
            projectName: 'project-b',
          })
        }
        throw new Error('File not found')
      })

      const command = new ProjectsCommand(createMockMetadataManager() as unknown as MetadataManager)
      const result = await command.execute()

      expect(result).toHaveLength(1)
      expect(result[0].projectName).toBe('project-a')
    })

    it('includes activeLooms count for each project', async () => {
      vi.mocked(fs.pathExists).mockImplementation(async (p) => {
        const pathStr = p.toString()
        if (pathStr === projectsDir) return true
        if (pathStr === '/Users/adam/Documents/Projects/project-a') return true
        return false
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(fs.readdir).mockResolvedValue(['project-a-marker'] as any)

      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          configuredAt: '2025-12-05T22:59:58.488Z',
          projectPath: '/Users/adam/Documents/Projects/project-a',
          projectName: 'project-a',
        })
      )

      const mockMetadata: LoomMetadata[] = [
        {
          description: 'Issue #1 work',
          created_at: '2025-12-05T22:59:58.488Z',
          branchName: 'issue-1',
          worktreePath: '/Users/adam/Documents/Projects/project-a-looms/issue-1',
          issueType: 'issue',
          issue_numbers: ['1'],
          pr_numbers: [],
          issueTracker: 'github',
          colorHex: '#dcebff',
          sessionId: 'session-1',
        },
        {
          description: 'Issue #2 work',
          created_at: '2025-12-05T22:59:58.488Z',
          branchName: 'issue-2',
          worktreePath: '/Users/adam/Documents/Projects/project-a-looms/issue-2',
          issueType: 'issue',
          issue_numbers: ['2'],
          pr_numbers: [],
          issueTracker: 'github',
          colorHex: '#dcebff',
          sessionId: 'session-2',
        },
      ]

      const command = new ProjectsCommand(createMockMetadataManager(mockMetadata) as unknown as MetadataManager)
      const result = await command.execute()

      expect(result).toHaveLength(1)
      expect(result[0].activeLooms).toBe(2)
    })

    it('handles read errors gracefully', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readdir).mockRejectedValue(new Error('Permission denied'))

      const command = new ProjectsCommand(createMockMetadataManager() as unknown as MetadataManager)
      const result = await command.execute()

      expect(result).toEqual([])
    })

    it('skips hidden files (starting with dot)', async () => {
      vi.mocked(fs.pathExists).mockImplementation(async (p) => {
        const pathStr = p.toString()
        if (pathStr === projectsDir) return true
        if (pathStr === '/Users/adam/Documents/Projects/project-a') return true
        return false
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(fs.readdir).mockResolvedValue(['.DS_Store', 'project-a-marker'] as any)

      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          configuredAt: '2025-12-05T22:59:58.488Z',
          projectPath: '/Users/adam/Documents/Projects/project-a',
          projectName: 'project-a',
        })
      )

      const command = new ProjectsCommand(createMockMetadataManager() as unknown as MetadataManager)
      const result = await command.execute()

      expect(result).toHaveLength(1)
      expect(result[0].projectName).toBe('project-a')
    })

    it('skips files with missing required fields', async () => {
      vi.mocked(fs.pathExists).mockImplementation(async (p) => {
        const pathStr = p.toString()
        if (pathStr === projectsDir) return true
        if (pathStr === '/Users/adam/Documents/Projects/project-a') return true
        return false
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(fs.readdir).mockResolvedValue(['incomplete-marker', 'project-a-marker'] as any)

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const filePathStr = filePath.toString()
        if (filePathStr.includes('incomplete-marker')) {
          return JSON.stringify({
            configuredAt: '2025-12-05T22:59:58.488Z',
            projectPath: '/some/path',
          })
        }
        if (filePathStr.includes('project-a-marker')) {
          return JSON.stringify({
            configuredAt: '2025-12-05T22:59:58.488Z',
            projectPath: '/Users/adam/Documents/Projects/project-a',
            projectName: 'project-a',
          })
        }
        throw new Error('File not found')
      })

      const command = new ProjectsCommand(createMockMetadataManager() as unknown as MetadataManager)
      const result = await command.execute()

      expect(result).toHaveLength(1)
      expect(result[0].projectName).toBe('project-a')
    })

    it('accepts --json flag but always returns same output', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false)

      const command = new ProjectsCommand(createMockMetadataManager() as unknown as MetadataManager)
      const resultWithJson = await command.execute({ json: true })
      const resultWithoutJson = await command.execute({ json: false })
      const resultNoOptions = await command.execute()

      expect(resultWithJson).toEqual(resultWithoutJson)
      expect(resultWithoutJson).toEqual(resultNoOptions)
    })
  })
})
