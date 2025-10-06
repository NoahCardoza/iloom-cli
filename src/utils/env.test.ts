import { describe, it, expect } from 'vitest'
import {
  parseEnvFile,
  formatEnvLine,
  validateEnvVariable,
  normalizeLineEndings,
  extractPort,
  isValidEnvKey,
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
})
