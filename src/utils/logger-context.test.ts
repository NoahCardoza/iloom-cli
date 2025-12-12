import { describe, it, expect, vi } from 'vitest'
import { setTimeout } from 'node:timers/promises'
import { getLogger, withLogger } from './logger-context.js'
import { logger as defaultLogger, createStderrLogger } from './logger.js'

describe('logger-context', () => {
  describe('getLogger', () => {
    it('returns the default logger when no context is set', () => {
      const result = getLogger()
      expect(result).toBe(defaultLogger)
    })

    it('returns the context logger when inside withLogger', async () => {
      const customLogger = createStderrLogger()

      await withLogger(customLogger, () => {
        const result = getLogger()
        expect(result).toBe(customLogger)
      })
    })

    it('returns default logger after withLogger completes', async () => {
      const customLogger = createStderrLogger()

      await withLogger(customLogger, () => {
        // Inside context
        expect(getLogger()).toBe(customLogger)
      })

      // Outside context
      expect(getLogger()).toBe(defaultLogger)
    })
  })

  describe('withLogger', () => {
    it('executes synchronous functions', () => {
      const customLogger = createStderrLogger()
      const result = withLogger(customLogger, () => 'sync result')
      expect(result).toBe('sync result')
    })

    it('executes async functions', async () => {
      const customLogger = createStderrLogger()
      const result = await withLogger(customLogger, async () => {
        // Simulate async operation
        await setTimeout(10)
        return 'async result'
      })
      expect(result).toBe('async result')
    })

    it('maintains context across async operations', async () => {
      const customLogger = createStderrLogger()

      await withLogger(customLogger, async () => {
        expect(getLogger()).toBe(customLogger)

        // Simulate async operation
        await setTimeout(10)

        // Context should still be customLogger after await
        expect(getLogger()).toBe(customLogger)
      })
    })

    it('maintains context in nested async calls', async () => {
      const customLogger = createStderrLogger()

      await withLogger(customLogger, async () => {
        expect(getLogger()).toBe(customLogger)

        // Nested async function
        const innerResult = await (async () => {
          expect(getLogger()).toBe(customLogger)
          return 'inner'
        })()

        expect(innerResult).toBe('inner')
        expect(getLogger()).toBe(customLogger)
      })
    })

    it('supports nested withLogger calls with different loggers', async () => {
      const outerLogger = createStderrLogger()
      const innerLogger = createStderrLogger()

      await withLogger(outerLogger, async () => {
        expect(getLogger()).toBe(outerLogger)

        await withLogger(innerLogger, async () => {
          expect(getLogger()).toBe(innerLogger)
        })

        // After inner completes, should be back to outer
        expect(getLogger()).toBe(outerLogger)
      })

      // After outer completes, should be back to default
      expect(getLogger()).toBe(defaultLogger)
    })

    it('allows using logger methods within context', async () => {
      const customLogger = createStderrLogger()
      const debugSpy = vi.spyOn(customLogger, 'debug')

      await withLogger(customLogger, () => {
        const contextLogger = getLogger()
        contextLogger.debug('test message')
      })

      expect(debugSpy).toHaveBeenCalledWith('test message')
    })
  })
})
