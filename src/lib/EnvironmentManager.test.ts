import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EnvironmentManager } from './EnvironmentManager.js'
import fs from 'fs-extra'

vi.mock('fs-extra')

describe('EnvironmentManager', () => {
  let manager: EnvironmentManager

  beforeEach(() => {
    manager = new EnvironmentManager()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('setEnvVar', () => {
    it('should create new file if it does not exist', async () => {
      const filePath = '/test/.env'
      vi.mocked(fs.pathExists).mockResolvedValue(false)
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'))
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      const result = await manager.setEnvVar(filePath, 'KEY', 'value')

      expect(result.success).toBe(true)
      expect(vi.mocked(fs.writeFile)).toHaveBeenCalledWith(
        filePath,
        'KEY="value"',
        'utf8'
      )
    })

    it('should add new variable to existing file', async () => {
      const filePath = '/test/.env'
      const existingContent = 'EXISTING_KEY="existing_value"'
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(existingContent)
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      const result = await manager.setEnvVar(filePath, 'NEW_KEY', 'new_value')

      expect(result.success).toBe(true)
      expect(vi.mocked(fs.writeFile)).toHaveBeenCalledWith(
        filePath,
        expect.stringContaining('EXISTING_KEY="existing_value"'),
        'utf8'
      )
      expect(vi.mocked(fs.writeFile)).toHaveBeenCalledWith(
        filePath,
        expect.stringContaining('NEW_KEY="new_value"'),
        'utf8'
      )
    })

    it('should update existing variable', async () => {
      const filePath = '/test/.env'
      const existingContent =
        'KEY="old_value"\nOTHER_KEY="other_value"'
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(existingContent)
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      const result = await manager.setEnvVar(filePath, 'KEY', 'new_value')

      expect(result.success).toBe(true)
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
      expect(writeCall[1]).toContain('KEY="new_value"')
      expect(writeCall[1]).toContain('OTHER_KEY="other_value"')
      expect(writeCall[1]).not.toContain('KEY="old_value"')
    })

    it('should escape quotes in values properly', async () => {
      const filePath = '/test/.env'
      vi.mocked(fs.pathExists).mockResolvedValue(false)
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      const result = await manager.setEnvVar(
        filePath,
        'KEY',
        'value with "quotes"'
      )

      expect(result.success).toBe(true)
      expect(vi.mocked(fs.writeFile)).toHaveBeenCalledWith(
        filePath,
        'KEY="value with \\"quotes\\""',
        'utf8'
      )
    })

    it('should preserve file formatting and comments', async () => {
      const filePath = '/test/.env'
      const existingContent = '# Comment\nKEY="value"\n\n# Another comment'
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(existingContent)
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      const result = await manager.setEnvVar(filePath, 'NEW_KEY', 'new_value')

      expect(result.success).toBe(true)
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
      expect(writeCall[1]).toContain('# Comment')
      expect(writeCall[1]).toContain('# Another comment')
    })

    it('should handle file permissions errors', async () => {
      const filePath = '/test/.env'
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Permission denied'))

      const result = await manager.setEnvVar(filePath, 'KEY', 'value')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should validate variable names', async () => {
      const filePath = '/test/.env'

      const result = await manager.setEnvVar(filePath, '123INVALID', 'value')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid')
    })

    it('should create backup on update when requested', async () => {
      const filePath = '/test/.env'
      const existingContent = 'KEY="old_value"'
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(existingContent)
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)
      vi.mocked(fs.copy).mockResolvedValue(undefined)

      const result = await manager.setEnvVar(
        filePath,
        'KEY',
        'new_value',
        true
      )

      expect(result.success).toBe(true)
      expect(result.backupPath).toBeDefined()
      expect(vi.mocked(fs.copy)).toHaveBeenCalled()
    })
  })

  describe('readEnvFile', () => {
    it('should parse simple key=value pairs', async () => {
      const filePath = '/test/.env'
      const content = 'KEY1="value1"\nKEY2="value2"'
      vi.mocked(fs.readFile).mockResolvedValue(content)

      const result = await manager.readEnvFile(filePath)

      expect(result.get('KEY1')).toBe('value1')
      expect(result.get('KEY2')).toBe('value2')
    })

    it('should handle quoted values', async () => {
      const filePath = '/test/.env'
      const content = 'KEY="quoted value"'
      vi.mocked(fs.readFile).mockResolvedValue(content)

      const result = await manager.readEnvFile(filePath)

      expect(result.get('KEY')).toBe('quoted value')
    })

    it('should ignore comments and empty lines', async () => {
      const filePath = '/test/.env'
      const content = '# Comment\nKEY="value"\n\n# Another comment'
      vi.mocked(fs.readFile).mockResolvedValue(content)

      const result = await manager.readEnvFile(filePath)

      expect(result.size).toBe(1)
      expect(result.get('KEY')).toBe('value')
    })

    it('should return empty map for non-existent file', async () => {
      const filePath = '/test/.env'
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'))

      const result = await manager.readEnvFile(filePath)

      expect(result.size).toBe(0)
    })

    it('should handle malformed lines gracefully', async () => {
      const filePath = '/test/.env'
      const content = 'VALID="value"\nINVALID_NO_EQUALS\nALSO_VALID="another"'
      vi.mocked(fs.readFile).mockResolvedValue(content)

      const result = await manager.readEnvFile(filePath)

      expect(result.size).toBe(2)
      expect(result.get('VALID')).toBe('value')
      expect(result.get('ALSO_VALID')).toBe('another')
    })
  })

  describe('copyEnvFile', () => {
    it('should copy file successfully', async () => {
      const source = '/test/.env'
      const destination = '/test2/.env'
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.copy).mockResolvedValue(undefined)

      await manager.copyEnvFile(source, destination)

      expect(vi.mocked(fs.copy)).toHaveBeenCalledWith(source, destination, {
        overwrite: true,
      })
    })

    it('should throw when source does not exist', async () => {
      const source = '/test/.env'
      const destination = '/test2/.env'
      vi.mocked(fs.pathExists).mockResolvedValue(false)

      await expect(manager.copyEnvFile(source, destination)).rejects.toThrow()
    })

    it('should respect overwrite option', async () => {
      const source = '/test/.env'
      const destination = '/test2/.env'
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.copy).mockResolvedValue(undefined)

      await manager.copyEnvFile(source, destination, { overwrite: false })

      expect(vi.mocked(fs.copy)).toHaveBeenCalledWith(source, destination, {
        overwrite: false,
      })
    })
  })

  describe('calculatePort', () => {
    it('should return 3000 + issue number', () => {
      const result = manager.calculatePort({ issueNumber: 25 })

      expect(result).toBe(3025)
    })

    it('should return 3000 + PR number when no issue', () => {
      const result = manager.calculatePort({ prNumber: 30 })

      expect(result).toBe(3030)
    })

    it('should use custom base port when provided', () => {
      const result = manager.calculatePort({ basePort: 4000, issueNumber: 25 })

      expect(result).toBe(4025)
    })

    it('should return base port when no issue/PR number', () => {
      const result = manager.calculatePort({})

      expect(result).toBe(3000)
    })

    it('should handle edge cases with large numbers', () => {
      const result = manager.calculatePort({ issueNumber: 9999 })

      expect(result).toBe(12999)
    })

    it('should throw when calculated port exceeds maximum', () => {
      expect(() =>
        manager.calculatePort({ basePort: 60000, issueNumber: 6000 })
      ).toThrow('exceeds maximum')
    })
  })

  describe('setPortForWorkspace', () => {
    it('should set PORT variable correctly', async () => {
      const filePath = '/test/.env'
      vi.mocked(fs.pathExists).mockResolvedValue(false)
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      const port = await manager.setPortForWorkspace(filePath, 25)

      expect(port).toBe(3025)
      expect(vi.mocked(fs.writeFile)).toHaveBeenCalledWith(
        filePath,
        'PORT="3025"',
        'utf8'
      )
    })

    it('should update existing PORT values', async () => {
      const filePath = '/test/.env'
      const existingContent = 'PORT="3000"\nOTHER="value"'
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(existingContent)
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      const port = await manager.setPortForWorkspace(filePath, 25)

      expect(port).toBe(3025)
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
      expect(writeCall[1]).toContain('PORT="3025"')
      expect(writeCall[1]).not.toContain('PORT="3000"')
    })

    it('should use default port when no issue/PR number', async () => {
      const filePath = '/test/.env'
      vi.mocked(fs.pathExists).mockResolvedValue(false)
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      const port = await manager.setPortForWorkspace(filePath)

      expect(port).toBe(3000)
    })
  })

  describe('validateEnvFile', () => {
    it('should validate correct file as valid', async () => {
      const filePath = '/test/.env'
      const content = 'VALID_KEY="value"\nANOTHER_KEY="another"'
      vi.mocked(fs.readFile).mockResolvedValue(content)

      const result = await manager.validateEnvFile(filePath)

      expect(result.valid).toBe(true)
      expect(result.errors.length).toBe(0)
    })

    it('should report invalid variable names', async () => {
      const filePath = '/test/.env'
      const content = 'VALID="value"\n123INVALID="value"'
      vi.mocked(fs.readFile).mockResolvedValue(content)

      const result = await manager.validateEnvFile(filePath)

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should handle empty files', async () => {
      const filePath = '/test/.env'
      vi.mocked(fs.readFile).mockResolvedValue('')

      const result = await manager.validateEnvFile(filePath)

      expect(result.valid).toBe(true)
      expect(result.errors.length).toBe(0)
    })

    it('should handle non-existent files', async () => {
      const filePath = '/test/.env'
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'))

      const result = await manager.validateEnvFile(filePath)

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })
})
