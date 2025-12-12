import { AsyncLocalStorage } from 'node:async_hooks'
import { logger as defaultLogger, type Logger } from './logger.js'

const loggerStorage = new AsyncLocalStorage<Logger>()

/**
 * Get current logger from context, or fall back to default
 * Use this instead of importing logger directly to support JSON mode
 */
export function getLogger(): Logger {
  return loggerStorage.getStore() ?? defaultLogger
}

/**
 * Run code with a specific logger in context
 * All code within the callback (including async operations) will use the provided logger
 */
export function withLogger<T>(logger: Logger, fn: () => T | Promise<T>): T | Promise<T> {
  return loggerStorage.run(logger, fn)
}
