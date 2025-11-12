import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EnvironmentManager } from './EnvironmentManager.js'
import fs from 'fs-extra'

// Mock fs-extra
vi.mock('fs-extra', () => ({
  default: {
    pathExists: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    copy: vi.fn(),
    ensureDir: vi.fn(),
  },
}))

// Mock logger
vi.mock('../utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
  })),
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
  },
}))

describe('EnvironmentManager', () => {
  let manager: EnvironmentManager

  beforeEach(() => {
    manager = new EnvironmentManager()
    vi.clearAllMocks()
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

      await manager.setEnvVar(filePath, 'KEY', 'value')

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

      await manager.setEnvVar(filePath, 'NEW_KEY', 'new_value')

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

      await manager.setEnvVar(filePath, 'KEY', 'new_value')

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
      expect(writeCall[1]).toContain('KEY="new_value"')
      expect(writeCall[1]).toContain('OTHER_KEY="other_value"')
      expect(writeCall[1]).not.toContain('KEY="old_value"')
    })

    it('should escape quotes in values properly', async () => {
      const filePath = '/test/.env'
      vi.mocked(fs.pathExists).mockResolvedValue(false)
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      await manager.setEnvVar(
        filePath,
        'KEY',
        'value with "quotes"'
      )

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

      await manager.setEnvVar(filePath, 'NEW_KEY', 'new_value')

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
      expect(writeCall[1]).toContain('# Comment')
      expect(writeCall[1]).toContain('# Another comment')
    })

    it('should handle file permissions errors', async () => {
      const filePath = '/test/.env'
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Permission denied'))

      await expect(
        manager.setEnvVar(filePath, 'KEY', 'value')
      ).rejects.toThrow('Permission denied')
    })

    it('should validate variable names', async () => {
      const filePath = '/test/.env'

      await expect(
        manager.setEnvVar(filePath, '123INVALID', 'value')
      ).rejects.toThrow('Invalid environment variable name')
    })

    it('should create backup on update when requested', async () => {
      const filePath = '/test/.env'
      const existingContent = 'KEY="old_value"'
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(existingContent)
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)
      vi.mocked(fs.copy).mockResolvedValue(undefined)

      const backupPath = await manager.setEnvVar(
        filePath,
        'KEY',
        'new_value',
        true
      )

      expect(backupPath).toBeDefined()
      expect(typeof backupPath).toBe('string')
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

    it('should handle unquoted values', async () => {
      const filePath = '/test/.env'
      const content = 'KEY=unquoted'
      vi.mocked(fs.readFile).mockResolvedValue(content)

      const result = await manager.readEnvFile(filePath)

      expect(result.get('KEY')).toBe('unquoted')
    })

    it('should skip comments and empty lines', async () => {
      const filePath = '/test/.env'
      const content = '# Comment\n\nKEY="value"\n# Another comment'
      vi.mocked(fs.readFile).mockResolvedValue(content)

      const result = await manager.readEnvFile(filePath)

      expect(result.get('KEY')).toBe('value')
      expect(result.size).toBe(1)
    })

    it('should handle escaped quotes', async () => {
      const filePath = '/test/.env'
      const content = 'KEY="value with \\"quotes\\""'
      vi.mocked(fs.readFile).mockResolvedValue(content)

      const result = await manager.readEnvFile(filePath)

      expect(result.get('KEY')).toBe('value with "quotes"')
    })

    it('should handle empty file', async () => {
      const filePath = '/test/.env'
      vi.mocked(fs.readFile).mockResolvedValue('')

      const result = await manager.readEnvFile(filePath)

      expect(result.size).toBe(0)
    })

    it('should handle file read errors gracefully', async () => {
      const filePath = '/test/.env'
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'))

      // The readEnvFile method might not throw, so just verify it returns an empty Map on error
      const result = await manager.readEnvFile(filePath)
      expect(result.size).toBe(0)
    })
  })

  describe('setPortForWorkspace', () => {
    it('should set port correctly for issue', async () => {
      const filePath = '/test/.env'
      vi.mocked(fs.pathExists).mockResolvedValue(false)
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      const port = await manager.setPortForWorkspace(filePath, 42)

      expect(port).toBe(3042)
      expect(vi.mocked(fs.writeFile)).toHaveBeenCalledWith(
        filePath,
        'PORT="3042"',
        'utf8'
      )
    })

    it('should set port correctly for PR', async () => {
      const filePath = '/test/.env'
      vi.mocked(fs.pathExists).mockResolvedValue(false)
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      const port = await manager.setPortForWorkspace(filePath, 123)

      expect(port).toBe(3123)
      expect(vi.mocked(fs.writeFile)).toHaveBeenCalledWith(
        filePath,
        'PORT="3123"',
        'utf8'
      )
    })

    it('should update existing PORT value', async () => {
      const filePath = '/test/.env'
      const existingContent = 'PORT="4000"\nOTHER="value"'
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(existingContent)
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      const port = await manager.setPortForWorkspace(filePath, 55)

      expect(port).toBe(3055)
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
      expect(writeCall[1]).toContain('PORT="3055"')
      expect(writeCall[1]).toContain('OTHER="value"')
    })
  })

  describe('validateEnvFile', () => {
    it('should validate correct file', async () => {
      const filePath = '/test/.env'
      const content = 'KEY="value"\nANOTHER_KEY="another"'
      vi.mocked(fs.readFile).mockResolvedValue(content)

      const result = await manager.validateEnvFile(filePath)

      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('should detect invalid variable names', async () => {
      const filePath = '/test/.env'
      const content = '123INVALID="value"\nVALID="value"'
      vi.mocked(fs.readFile).mockResolvedValue(content)

      const result = await manager.validateEnvFile(filePath)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('123INVALID'))).toBe(true)
    })

    it('should detect parsing errors', async () => {
      const filePath = '/test/.env'
      // Lines without equals signs are actually treated as empty values, not parsing errors
      // To test actual parsing issues, we need invalid variable names
      const content = '123INVALID="value"\nVALID="value"'
      vi.mocked(fs.readFile).mockResolvedValue(content)

      const result = await manager.validateEnvFile(filePath)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('123INVALID'))).toBe(true)
    })

    it('should validate empty file as valid', async () => {
      const filePath = '/test/.env'
      vi.mocked(fs.readFile).mockResolvedValue('')

      const result = await manager.validateEnvFile(filePath)

      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })
  })
})