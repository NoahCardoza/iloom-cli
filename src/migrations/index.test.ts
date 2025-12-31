import { describe, it, expect, vi } from 'vitest'
import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import { migrations } from './index.js'

// Mock fs-extra
vi.mock('fs-extra')

describe('migrations', () => {
  describe('v0.6.1 global gitignore migration', () => {
    // Use actual homedir for path expectations since os is not easily mockable
    const expectedPath = path.join(os.homedir(), '.config', 'git', 'ignore')
    const pattern = '**/.iloom/settings.local.json'
    const migration = migrations.find(m => m.version === '0.6.1')

    it('should exist', () => {
      expect(migration).toBeDefined()
      expect(migration?.description).toBe('Add global gitignore for .iloom/settings.local.json')
    })

    it('should create ~/.config/git/ignore if not exists', async () => {
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      await migration?.migrate()

      expect(fs.ensureDir).toHaveBeenCalledWith(path.dirname(expectedPath))
      expect(fs.writeFile).toHaveBeenCalledWith(
        expectedPath,
        '\n# Added by iloom CLI\n' + pattern + '\n',
        'utf-8'
      )
    })

    it('should append pattern if not already present', async () => {
      const existingContent = '# Existing ignores\n*.log\n'
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
      vi.mocked(fs.readFile).mockResolvedValue(existingContent)
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      await migration?.migrate()

      expect(fs.writeFile).toHaveBeenCalledWith(
        expectedPath,
        existingContent + '\n# Added by iloom CLI\n' + pattern + '\n',
        'utf-8'
      )
    })

    it('should not duplicate if pattern exists', async () => {
      const existingContent = '# Existing\n**/.iloom/settings.local.json\n'
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
      vi.mocked(fs.readFile).mockResolvedValue(existingContent)

      await migration?.migrate()

      expect(fs.writeFile).not.toHaveBeenCalled()
    })

    it('should create parent directory if not exists', async () => {
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      await migration?.migrate()

      expect(fs.ensureDir).toHaveBeenCalledWith(path.join(os.homedir(), '.config', 'git'))
    })

    it('should handle file without trailing newline', async () => {
      const existingContent = '*.log'
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
      vi.mocked(fs.readFile).mockResolvedValue(existingContent)
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      await migration?.migrate()

      expect(fs.writeFile).toHaveBeenCalledWith(
        expectedPath,
        existingContent + '\n\n# Added by iloom CLI\n' + pattern + '\n',
        'utf-8'
      )
    })
  })
})
