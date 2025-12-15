import path from 'path'
import dotenvFlow, { type DotenvFlowConfigOptions } from 'dotenv-flow'
import { logger } from './logger.js'

/**
 * Parse .env file content into key-value map
 * Handles comments, empty lines, quoted/unquoted values, multiline values
 */
export function parseEnvFile(content: string): Map<string, string> {
  const envMap = new Map<string, string>()
  const lines = content.split('\n')

  for (const line of lines) {
    const trimmedLine = line.trim()

    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue
    }

    // Remove 'export ' prefix if present
    const cleanLine = trimmedLine.startsWith('export ')
      ? trimmedLine.substring(7)
      : trimmedLine

    // Find the first equals sign
    const equalsIndex = cleanLine.indexOf('=')
    if (equalsIndex === -1) {
      continue
    }

    const key = cleanLine.substring(0, equalsIndex).trim()
    let value = cleanLine.substring(equalsIndex + 1)

    // Handle quoted values
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.substring(1, value.length - 1)
      // Unescape quotes
      value = value.replace(/\\"/g, '"').replace(/\\'/g, "'")
      // Unescape newlines
      value = value.replace(/\\n/g, '\n')
    }

    if (key) {
      envMap.set(key, value)
    }
  }

  return envMap
}

/**
 * Format environment variable as line for .env file
 * Always quotes values and escapes internal quotes
 */
export function formatEnvLine(key: string, value: string): string {
  // Escape quotes and newlines in the value
  const escapedValue = value
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')

  return `${key}="${escapedValue}"`
}

/**
 * Validate environment variable name and value
 */
export function validateEnvVariable(
  key: string,
  _value?: string
): { valid: boolean; error?: string } {
  if (!key || key.length === 0) {
    return {
      valid: false,
      error: 'Environment variable key cannot be empty',
    }
  }

  if (!isValidEnvKey(key)) {
    return {
      valid: false,
      error: `Invalid environment variable name: ${key}. Must start with a letter or underscore and contain only letters, numbers, and underscores.`,
    }
  }

  // Values can be any string, including empty
  return { valid: true }
}

/**
 * Normalize line endings for cross-platform compatibility
 */
export function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/**
 * Extract port from .env file if present
 */
export function extractPort(envContent: Map<string, string>): number | null {
  const portValue = envContent.get('PORT')
  if (!portValue) {
    return null
  }

  const port = parseInt(portValue, 10)
  if (isNaN(port)) {
    return null
  }

  return port
}

/**
 * Check if environment variable key is valid
 */
export function isValidEnvKey(key: string): boolean {
  if (!key || key.length === 0) {
    return false
  }

  // Must start with letter or underscore, followed by letters, numbers, or underscores
  const validKeyRegex = /^[A-Za-z_][A-Za-z0-9_]*$/
  return validKeyRegex.test(key)
}

/**
 * Load environment variables using dotenv-flow
 * Supports environment-specific files (.env.development, .env.production, etc.)
 * and local overrides (.env.local, .env.development.local)
 */
export function loadEnvIntoProcess(options?: {
  path?: string
  nodeEnv?: string
  defaultNodeEnv?: string
}): { parsed?: Record<string, string>; error?: Error } {
  logger.debug('Loading environment variables with dotenv-flow', {
    options: {
      path: options?.path ?? 'current working directory',
      nodeEnv: options?.nodeEnv ?? 'not specified',
      defaultNodeEnv: options?.defaultNodeEnv ?? 'development (default)'
    }
  })

  const configOptions: Partial<DotenvFlowConfigOptions> = {
    silent: true, // Don't throw errors if .env files are missing
  }

  // Only add defined values to avoid TypeScript strict type issues
  if (options?.path !== undefined) {
    configOptions.path = options.path
    logger.debug(`Using custom path: ${options.path}`)
  }
  if (options?.nodeEnv !== undefined) {
    configOptions.node_env = options.nodeEnv
    logger.debug(`Using NODE_ENV: ${options.nodeEnv}`)
  }
  if (options?.defaultNodeEnv !== undefined) {
    configOptions.default_node_env = options.defaultNodeEnv
    logger.debug(`Using default NODE_ENV: ${options.defaultNodeEnv}`)
  } else {
    configOptions.default_node_env = 'development'
    logger.debug('Using default NODE_ENV: development')
  }

  logger.debug('dotenv-flow config options:', configOptions)

  const result = dotenvFlow.config(configOptions)

  const returnValue: { parsed?: Record<string, string>; error?: Error } = {}

  if (result.parsed) {
    returnValue.parsed = result.parsed as Record<string, string>
    const variableCount = Object.keys(result.parsed).length
    logger.debug(`Successfully loaded ${variableCount} environment variables`)
  } else {
    logger.debug('No environment variables were parsed')
  }

  if (result.error) {
    returnValue.error = result.error
    logger.debug('dotenv-flow returned an error', {
      error: result.error.message,
      name: result.error.name
    })
  } else {
    logger.debug('dotenv-flow completed without errors')
  }

  return returnValue
}

/**
 * Check if an error from loadEnvIntoProcess indicates no .env files were found
 * This is a harmless condition that shouldn't be logged as a warning
 */
export function isNoEnvFilesFoundError(error: Error): boolean {
  return error.message.startsWith('no ".env*" files matching pattern')
}

/**
 * Load environment variables for a specific workspace
 * Automatically determines environment based on NODE_ENV or defaults to development
 */
export function loadWorkspaceEnv(workspacePath: string): {
  parsed?: Record<string, string>
  error?: Error
} {
  const nodeEnv = process.env.NODE_ENV ?? 'development'

  logger.debug('Loading workspace environment variables', {
    workspacePath,
    detectedNodeEnv: nodeEnv,
    processNodeEnv: process.env.NODE_ENV ?? 'not set'
  })

  return loadEnvIntoProcess({
    path: workspacePath,
    nodeEnv: nodeEnv,
    defaultNodeEnv: 'development'
  })
}

// CONSTANT: Always use 'development' per critical constraint, unless overridden
const DOTENV_FLOW_NODE_ENV = process.env.DOTENV_FLOW_NODE_ENV ?? 'development'

/**
 * Get dotenv-flow files in precedence order (lowest to highest)
 * Always uses 'development' as NODE_ENV per constraint
 */
export function getDotenvFlowFiles(): string[] {
  return [
    '.env',
    '.env.local',
    `.env.${DOTENV_FLOW_NODE_ENV}`,
    `.env.${DOTENV_FLOW_NODE_ENV}.local`
  ]
}

/**
 * Map a file to its "local" equivalent for git-safe writes
 * .env -> .env.local
 * .env.{NODE_ENV} -> .env.{NODE_ENV}.local
 * Already local files return unchanged
 */
export function getLocalEquivalent(filename: string): string {
  // Already a .local file
  if (filename.endsWith('.local')) {
    return filename
  }
  return `${filename}.local`
}

/**
 * Find the appropriate env file to write a database URL variable to
 * Considers dotenv-flow precedence and git tracking status
 * Returns path relative to workspacePath
 *
 * Algorithm:
 * 1. Search files in reverse precedence order (highest first)
 * 2. Find first file containing the variable
 * 3. If tracked by git, return its .local equivalent
 * 4. If not tracked, return the file itself
 * 5. If not found anywhere, return '.env.local' (safe default)
 */
export async function findEnvFileForDatabaseUrl(
  workspacePath: string,
  variableName: string,
  isFileTracked: (filePath: string, cwd: string) => Promise<boolean>,
  fileExists: (filePath: string) => Promise<boolean>,
  getEnvVariable: (filePath: string, varName: string) => Promise<string | null>
): Promise<string> {
  // Find the highest-precedence file containing the variable
  const file = await findEnvFileContainingVariable(workspacePath, variableName, fileExists, getEnvVariable)

  if (file === null) {
    // Variable not found anywhere - use safe default
    return '.env.local'
  }

  // Found the variable - check git tracking
  const isTracked = await isFileTracked(file, workspacePath)
  if (isTracked) {
    // Return .local equivalent for git safety
    return getLocalEquivalent(file)
  }

  return file
}

/**
 * Build shell source commands for all existing dotenv-flow files
 * Returns commands in precedence order (later overrides earlier)
 */
export async function buildEnvSourceCommands(
  workspacePath: string,
  fileExists: (filePath: string) => Promise<boolean>
): Promise<string[]> {
  const files = getDotenvFlowFiles()
  const commands: string[] = []

  for (const file of files) {
    const fullPath = path.join(workspacePath, file)
    const exists = await fileExists(fullPath)
    if (exists) {
      commands.push(`source ${file}`)
    }
  }

  return commands
}

/**
 * Find the highest-precedence env file containing a variable
 * Searches all dotenv-flow files in reverse precedence order (highest first)
 * Returns the relative filename if found, null otherwise
 */
export async function findEnvFileContainingVariable(
  workspacePath: string,
  variableName: string,
  fileExists: (filePath: string) => Promise<boolean>,
  getEnvVariable: (filePath: string, varName: string) => Promise<string | null>
): Promise<string | null> {
  const files = getDotenvFlowFiles().reverse() // highest precedence first

  for (const file of files) {
    const fullPath = path.join(workspacePath, file)

    // Skip if file doesn't exist
    if (!(await fileExists(fullPath))) {
      continue
    }

    // Check if file contains the variable
    const value = await getEnvVariable(fullPath, variableName)
    if (value !== null) {
      return file
    }
  }

  return null
}

/**
 * Check if a variable exists in any dotenv-flow file
 * Searches all dotenv-flow files (.env, .env.local, .env.{NODE_ENV}, .env.{NODE_ENV}.local)
 * Returns true if variable is found in any file, false otherwise
 */
export async function hasVariableInAnyEnvFile(
  workspacePath: string,
  variableName: string,
  fileExists: (filePath: string) => Promise<boolean>,
  getEnvVariable: (filePath: string, varName: string) => Promise<string | null>
): Promise<boolean> {
  const file = await findEnvFileContainingVariable(workspacePath, variableName, fileExists, getEnvVariable)
  return file !== null
}
