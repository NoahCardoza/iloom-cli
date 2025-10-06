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
