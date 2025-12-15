import { describe, it, expect, vi } from 'vitest'
import {
  parseEnvFile,
  formatEnvLine,
  validateEnvVariable,
  normalizeLineEndings,
  extractPort,
  isValidEnvKey,
  getDotenvFlowFiles,
  getLocalEquivalent,
  findEnvFileForDatabaseUrl,
  buildEnvSourceCommands,
  isNoEnvFilesFoundError,
} from './env.js'

describe('env utilities', () => {
  describe('parseEnvFile', () => {
    it('should parse basic KEY=value format', () => {
      const content = 'KEY1=value1\nKEY2=value2'
      const result = parseEnvFile(content)

      expect(result.get('KEY1')).toBe('value1')
      expect(result.get('KEY2')).toBe('value2')
      expect(result.size).toBe(2)
    })

    it('should handle KEY="quoted value" format', () => {
      const content = 'KEY="quoted value"'
      const result = parseEnvFile(content)

      expect(result.get('KEY')).toBe('quoted value')
    })

    it("should handle KEY='single quoted value' format", () => {
      const content = "KEY='single quoted value'"
      const result = parseEnvFile(content)

      expect(result.get('KEY')).toBe('single quoted value')
    })

    it('should ignore comments starting with #', () => {
      const content = '# This is a comment\nKEY=value\n# Another comment'
      const result = parseEnvFile(content)

      expect(result.size).toBe(1)
      expect(result.get('KEY')).toBe('value')
    })

    it('should handle empty lines', () => {
      const content = 'KEY1=value1\n\n\nKEY2=value2\n\n'
      const result = parseEnvFile(content)

      expect(result.size).toBe(2)
      expect(result.get('KEY1')).toBe('value1')
      expect(result.get('KEY2')).toBe('value2')
    })

    it('should preserve spaces in quoted values', () => {
      const content = 'KEY="  value with spaces  "'
      const result = parseEnvFile(content)

      expect(result.get('KEY')).toBe('  value with spaces  ')
    })

    it('should handle escaped quotes in values', () => {
      const content = 'KEY="value with \\" escaped quotes"'
      const result = parseEnvFile(content)

      expect(result.get('KEY')).toBe('value with " escaped quotes')
    })

    it('should parse export KEY=value format', () => {
      const content = 'export KEY=value'
      const result = parseEnvFile(content)

      expect(result.get('KEY')).toBe('value')
    })

    it('should handle empty file', () => {
      const content = ''
      const result = parseEnvFile(content)

      expect(result.size).toBe(0)
    })

    it('should handle values with equals signs', () => {
      const content = 'KEY=value=with=equals'
      const result = parseEnvFile(content)

      expect(result.get('KEY')).toBe('value=with=equals')
    })
  })

  describe('formatEnvLine', () => {
    it('should always quote values', () => {
      const result = formatEnvLine('KEY', 'value')

      expect(result).toBe('KEY="value"')
    })

    it('should escape quotes within values', () => {
      const result = formatEnvLine('KEY', 'value with "quotes"')

      expect(result).toBe('KEY="value with \\"quotes\\""')
    })

    it('should handle empty values', () => {
      const result = formatEnvLine('KEY', '')

      expect(result).toBe('KEY=""')
    })

    it('should handle special characters', () => {
      const result = formatEnvLine('KEY', 'value with $pecial ch@rs!')

      expect(result).toBe('KEY="value with $pecial ch@rs!"')
    })

    it('should handle newlines in values', () => {
      const result = formatEnvLine('KEY', 'value\nwith\nnewlines')

      expect(result).toBe('KEY="value\\nwith\\nnewlines"')
    })
  })

  describe('validateEnvVariable', () => {
    it('should accept valid variable names with letters, numbers, and underscores', () => {
      expect(validateEnvVariable('VALID_KEY_123').valid).toBe(true)
      expect(validateEnvVariable('_LEADING_UNDERSCORE').valid).toBe(true)
      expect(validateEnvVariable('MixedCase123').valid).toBe(true)
    })

    it('should reject names starting with numbers', () => {
      const result = validateEnvVariable('123INVALID')

      expect(result.valid).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should reject names with special characters', () => {
      const result = validateEnvVariable('INVALID-KEY')

      expect(result.valid).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should accept any string value', () => {
      expect(validateEnvVariable('KEY', 'any string value 123!@#').valid).toBe(
        true
      )
      expect(validateEnvVariable('KEY', 'value with "quotes"').valid).toBe(true)
    })

    it('should handle empty values', () => {
      expect(validateEnvVariable('KEY', '').valid).toBe(true)
    })

    it('should handle undefined values', () => {
      expect(validateEnvVariable('KEY').valid).toBe(true)
    })

    it('should reject empty key names', () => {
      const result = validateEnvVariable('')

      expect(result.valid).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('normalizeLineEndings', () => {
    it('should convert CRLF to LF', () => {
      const content = 'line1\r\nline2\r\nline3'
      const result = normalizeLineEndings(content)

      expect(result).toBe('line1\nline2\nline3')
    })

    it('should preserve existing LF', () => {
      const content = 'line1\nline2\nline3'
      const result = normalizeLineEndings(content)

      expect(result).toBe('line1\nline2\nline3')
    })

    it('should handle mixed line endings', () => {
      const content = 'line1\r\nline2\nline3\r\nline4'
      const result = normalizeLineEndings(content)

      expect(result).toBe('line1\nline2\nline3\nline4')
    })

    it('should handle empty string', () => {
      const result = normalizeLineEndings('')

      expect(result).toBe('')
    })
  })

  describe('extractPort', () => {
    it('should extract PORT value', () => {
      const envContent = new Map([
        ['PORT', '3000'],
        ['OTHER_VAR', 'value'],
      ])
      const result = extractPort(envContent)

      expect(result).toBe(3000)
    })

    it('should return null when PORT not present', () => {
      const envContent = new Map([['OTHER_VAR', 'value']])
      const result = extractPort(envContent)

      expect(result).toBeNull()
    })

    it('should parse numeric strings', () => {
      const envContent = new Map([['PORT', '8080']])
      const result = extractPort(envContent)

      expect(result).toBe(8080)
    })

    it('should handle invalid port values', () => {
      const envContent = new Map([['PORT', 'not-a-number']])
      const result = extractPort(envContent)

      expect(result).toBeNull()
    })

    it('should handle empty PORT value', () => {
      const envContent = new Map([['PORT', '']])
      const result = extractPort(envContent)

      expect(result).toBeNull()
    })
  })

  describe('isValidEnvKey', () => {
    it('should validate standard names', () => {
      expect(isValidEnvKey('VALID_KEY')).toBe(true)
      expect(isValidEnvKey('ANOTHER_VALID_KEY_123')).toBe(true)
      expect(isValidEnvKey('_LEADING_UNDERSCORE')).toBe(true)
    })

    it('should reject invalid characters', () => {
      expect(isValidEnvKey('INVALID-KEY')).toBe(false)
      expect(isValidEnvKey('INVALID.KEY')).toBe(false)
      expect(isValidEnvKey('INVALID KEY')).toBe(false)
      expect(isValidEnvKey('INVALID@KEY')).toBe(false)
    })

    it('should reject names starting with numbers', () => {
      expect(isValidEnvKey('123INVALID')).toBe(false)
    })

    it('should reject empty strings', () => {
      expect(isValidEnvKey('')).toBe(false)
    })
  })

  describe('getDotenvFlowFiles', () => {
    it('should return files in correct precedence order (lowest to highest)', () => {
      const files = getDotenvFlowFiles()
      expect(files).toEqual([
        '.env',
        '.env.local',
        '.env.development',
        '.env.development.local'
      ])
    })

    it('should always use development as NODE_ENV per constraint', () => {
      const files = getDotenvFlowFiles()
      expect(files[2]).toBe('.env.development')
      expect(files[3]).toBe('.env.development.local')
    })
  })

  describe('getLocalEquivalent', () => {
    it('should map .env to .env.local', () => {
      expect(getLocalEquivalent('.env')).toBe('.env.local')
    })

    it('should map .env.development to .env.development.local', () => {
      expect(getLocalEquivalent('.env.development')).toBe('.env.development.local')
    })

    it('should return .env.local unchanged', () => {
      expect(getLocalEquivalent('.env.local')).toBe('.env.local')
    })

    it('should return .env.development.local unchanged', () => {
      expect(getLocalEquivalent('.env.development.local')).toBe('.env.development.local')
    })
  })

  describe('findEnvFileForDatabaseUrl', () => {
    it('should return file containing variable when not git-tracked', async () => {
      const mockIsFileTracked = vi.fn().mockResolvedValue(false)
      const mockFileExists = vi.fn().mockResolvedValue(true)
      const mockGetEnvVariable = vi.fn()
        .mockResolvedValueOnce(null) // .env.development.local
        .mockResolvedValueOnce(null) // .env.development
        .mockResolvedValueOnce('postgres://localhost/db') // .env.local - found here

      const result = await findEnvFileForDatabaseUrl(
        '/workspace',
        'DATABASE_URL',
        mockIsFileTracked,
        mockFileExists,
        mockGetEnvVariable
      )

      expect(result).toBe('.env.local')
      expect(mockIsFileTracked).toHaveBeenCalledWith('.env.local', '/workspace')
    })

    it('should return .local equivalent when file containing variable is git-tracked', async () => {
      const mockIsFileTracked = vi.fn().mockResolvedValue(true) // File is tracked
      const mockFileExists = vi.fn().mockResolvedValue(true)
      const mockGetEnvVariable = vi.fn()
        .mockResolvedValueOnce(null) // .env.development.local
        .mockResolvedValueOnce(null) // .env.development
        .mockResolvedValueOnce(null) // .env.local
        .mockResolvedValueOnce('postgres://localhost/db') // .env - found here but tracked

      const result = await findEnvFileForDatabaseUrl(
        '/workspace',
        'DATABASE_URL',
        mockIsFileTracked,
        mockFileExists,
        mockGetEnvVariable
      )

      expect(result).toBe('.env.local') // Should redirect to .local equivalent
      expect(mockIsFileTracked).toHaveBeenCalledWith('.env', '/workspace')
    })

    it('should search in reverse precedence order (highest first)', async () => {
      const mockIsFileTracked = vi.fn().mockResolvedValue(false)
      const mockFileExists = vi.fn().mockResolvedValue(true)
      const mockGetEnvVariable = vi.fn()
        .mockResolvedValueOnce('postgres://localhost/db') // .env.development.local - found first

      const result = await findEnvFileForDatabaseUrl(
        '/workspace',
        'DATABASE_URL',
        mockIsFileTracked,
        mockFileExists,
        mockGetEnvVariable
      )

      expect(result).toBe('.env.development.local')
      expect(mockGetEnvVariable).toHaveBeenCalledTimes(1) // Should stop after finding first match
    })

    it('should return .env.local when variable not found anywhere', async () => {
      const mockIsFileTracked = vi.fn().mockResolvedValue(false)
      const mockFileExists = vi.fn().mockResolvedValue(true)
      const mockGetEnvVariable = vi.fn().mockResolvedValue(null) // Not found in any file

      const result = await findEnvFileForDatabaseUrl(
        '/workspace',
        'DATABASE_URL',
        mockIsFileTracked,
        mockFileExists,
        mockGetEnvVariable
      )

      expect(result).toBe('.env.local') // Safe default
    })

    it('should skip non-existent files', async () => {
      const mockIsFileTracked = vi.fn().mockResolvedValue(false)
      const mockFileExists = vi.fn()
        .mockResolvedValueOnce(false) // .env.development.local doesn't exist
        .mockResolvedValueOnce(false) // .env.development doesn't exist
        .mockResolvedValueOnce(true)  // .env.local exists
        .mockResolvedValueOnce(true)  // .env exists
      const mockGetEnvVariable = vi.fn()
        .mockResolvedValueOnce('postgres://localhost/db') // .env.local - found here

      const result = await findEnvFileForDatabaseUrl(
        '/workspace',
        'DATABASE_URL',
        mockIsFileTracked,
        mockFileExists,
        mockGetEnvVariable
      )

      expect(result).toBe('.env.local')
      expect(mockGetEnvVariable).toHaveBeenCalledTimes(1) // Only called for existing files
    })
  })

  describe('buildEnvSourceCommands', () => {
    it('should return empty array when no env files exist', async () => {
      const mockFileExists = vi.fn().mockResolvedValue(false)

      const result = await buildEnvSourceCommands('/workspace', mockFileExists)

      expect(result).toEqual([])
    })

    it('should return source commands for all existing files in order', async () => {
      const mockFileExists = vi.fn()
        .mockResolvedValueOnce(true)  // .env exists
        .mockResolvedValueOnce(false) // .env.local doesn't exist
        .mockResolvedValueOnce(true)  // .env.development exists
        .mockResolvedValueOnce(true)  // .env.development.local exists

      const result = await buildEnvSourceCommands('/workspace', mockFileExists)

      expect(result).toEqual([
        'source .env',
        'source .env.development',
        'source .env.development.local'
      ])
    })

    it('should use development as NODE_ENV per constraint', async () => {
      const mockFileExists = vi.fn().mockResolvedValue(true)

      const result = await buildEnvSourceCommands('/workspace', mockFileExists)

      expect(result).toContain('source .env.development')
      expect(result).toContain('source .env.development.local')
    })

    it('should only include files that exist in workspace', async () => {
      const mockFileExists = vi.fn()
        .mockResolvedValueOnce(true)  // .env exists
        .mockResolvedValueOnce(true)  // .env.local exists
        .mockResolvedValueOnce(false) // .env.development doesn't exist
        .mockResolvedValueOnce(false) // .env.development.local doesn't exist

      const result = await buildEnvSourceCommands('/workspace', mockFileExists)

      expect(result).toEqual([
        'source .env',
        'source .env.local'
      ])
    })
  })

  describe('isNoEnvFilesFoundError', () => {
    it('should return true for dotenv-flow "no files found" error', () => {
      const error = new Error('no ".env*" files matching pattern ".env[.development][.local]" in "/some/path" dir')
      expect(isNoEnvFilesFoundError(error)).toBe(true)
    })

    it('should return true for different path in error message', () => {
      const error = new Error('no ".env*" files matching pattern ".env[.production][.local]" in "/another/workspace" dir')
      expect(isNoEnvFilesFoundError(error)).toBe(true)
    })

    it('should return false for other errors', () => {
      const error = new Error('Permission denied')
      expect(isNoEnvFilesFoundError(error)).toBe(false)
    })

    it('should return false for empty error message', () => {
      const error = new Error('')
      expect(isNoEnvFilesFoundError(error)).toBe(false)
    })

    it('should return false for similar but different error messages', () => {
      const error = new Error('Could not find .env files')
      expect(isNoEnvFilesFoundError(error)).toBe(false)
    })
  })
})
