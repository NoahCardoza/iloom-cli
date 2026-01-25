import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { normalizePath, pathsEqual } from './xplat-utils.js'

describe('xplat-utils', () => {
  describe('normalizePath', () => {
    it('normalizes redundant separators', () => {
      expect(normalizePath('/Users//adam///Documents')).toBe('/Users/adam/Documents')
    })

    it('normalizes . and .. components', () => {
      expect(normalizePath('/Users/adam/./Documents/../Projects')).toBe('/Users/adam/Projects')
    })

    it('preserves case on Unix', () => {
      expect(normalizePath('/Users/Adam/Documents')).toBe('/Users/Adam/Documents')
    })

    describe('on Windows', () => {
      const originalPlatform = process.platform

      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'win32' })
      })

      afterEach(() => {
        Object.defineProperty(process, 'platform', { value: originalPlatform })
      })

      it('converts backslashes to forward slashes', () => {
        expect(normalizePath('C:\\Users\\adam\\Documents')).toBe('c:/users/adam/documents')
      })

      it('lowercases paths', () => {
        expect(normalizePath('C:/Users/Adam/Documents')).toBe('c:/users/adam/documents')
      })
    })
  })

  describe('pathsEqual', () => {
    it('returns true for identical paths', () => {
      expect(pathsEqual('/Users/adam/Documents', '/Users/adam/Documents')).toBe(true)
    })

    it('returns false for different paths', () => {
      expect(pathsEqual('/Users/adam/Documents', '/Users/adam/Projects')).toBe(false)
    })

    it('returns true when both are null', () => {
      expect(pathsEqual(null, null)).toBe(true)
    })

    it('returns true when both are undefined', () => {
      expect(pathsEqual(undefined, undefined)).toBe(true)
    })

    it('returns false when one is null and other is not', () => {
      expect(pathsEqual('/path', null)).toBe(false)
      expect(pathsEqual(null, '/path')).toBe(false)
    })

    it('normalizes paths before comparison', () => {
      expect(pathsEqual('/Users//adam/Documents', '/Users/adam/Documents')).toBe(true)
    })

    describe('on Windows', () => {
      const originalPlatform = process.platform

      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'win32' })
      })

      afterEach(() => {
        Object.defineProperty(process, 'platform', { value: originalPlatform })
      })

      it('treats paths as case-insensitive', () => {
        expect(pathsEqual('C:/Users/Adam', 'C:/Users/adam')).toBe(true)
      })

      it('treats backslash and forward slash as equal', () => {
        expect(pathsEqual('C:\\Users\\adam', 'C:/Users/adam')).toBe(true)
      })
    })
  })
})
