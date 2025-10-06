import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EnvironmentManager } from './EnvironmentManager.js'
import fs from 'fs-extra'
import path from 'path'
import os from 'os'

describe('EnvironmentManager integration', () => {
  let testDir: string
  let manager: EnvironmentManager

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'env-test-'))
    manager = new EnvironmentManager()
  })

  afterEach(async () => {
    await fs.remove(testDir)
  })

  describe('full workflow', () => {
    it('should handle complete workspace environment setup', async () => {
      const envPath = path.join(testDir, '.env')

      // Create .env file
      const result1 = await manager.setEnvVar(envPath, 'DATABASE_URL', 'postgres://localhost/db')
      expect(result1.success).toBe(true)

      // Add more variables
      const result2 = await manager.setEnvVar(envPath, 'API_KEY', 'test-key-123')
      expect(result2.success).toBe(true)

      const result3 = await manager.setEnvVar(envPath, 'NODE_ENV', 'development')
      expect(result3.success).toBe(true)

      // Set port for workspace
      const port = await manager.setPortForWorkspace(envPath, 42)
      expect(port).toBe(3042)

      // Read and validate
      const envContent = await manager.readEnvFile(envPath)
      expect(envContent.get('DATABASE_URL')).toBe('postgres://localhost/db')
      expect(envContent.get('API_KEY')).toBe('test-key-123')
      expect(envContent.get('NODE_ENV')).toBe('development')
      expect(envContent.get('PORT')).toBe('3042')

      // Copy to new location
      const newEnvPath = path.join(testDir, 'worktree', '.env')
      await fs.ensureDir(path.dirname(newEnvPath))
      await manager.copyEnvFile(envPath, newEnvPath)

      // Verify copied content
      const copiedContent = await manager.readEnvFile(newEnvPath)
      expect(copiedContent.get('DATABASE_URL')).toBe('postgres://localhost/db')
      expect(copiedContent.get('PORT')).toBe('3042')

      // Validate both files
      const validation1 = await manager.validateEnvFile(envPath)
      expect(validation1.valid).toBe(true)

      const validation2 = await manager.validateEnvFile(newEnvPath)
      expect(validation2.valid).toBe(true)
    })

    it('should preserve comments and formatting during updates', async () => {
      const envPath = path.join(testDir, '.env')

      // Create initial file with comments
      const initialContent = `# Database configuration
DATABASE_URL="postgres://localhost/db"

# API settings
API_KEY="old-key"

# Environment
NODE_ENV="development"`

      await fs.writeFile(envPath, initialContent, 'utf8')

      // Update a value
      const result = await manager.setEnvVar(envPath, 'API_KEY', 'new-key')
      expect(result.success).toBe(true)

      // Read the file content directly
      const fileContent = await fs.readFile(envPath, 'utf8')

      // Verify comments are preserved
      expect(fileContent).toContain('# Database configuration')
      expect(fileContent).toContain('# API settings')
      expect(fileContent).toContain('# Environment')

      // Verify value was updated
      expect(fileContent).toContain('API_KEY="new-key"')
      expect(fileContent).not.toContain('API_KEY="old-key"')

      // Verify other values unchanged
      expect(fileContent).toContain('DATABASE_URL="postgres://localhost/db"')
      expect(fileContent).toContain('NODE_ENV="development"')
    })

    it('should handle backup and recovery', async () => {
      const envPath = path.join(testDir, '.env')

      // Create initial file
      await manager.setEnvVar(envPath, 'KEY1', 'value1')
      await manager.setEnvVar(envPath, 'KEY2', 'value2')

      // Update with backup
      const result = await manager.setEnvVar(envPath, 'KEY1', 'new-value', true)
      expect(result.success).toBe(true)
      expect(result.backupPath).toBeDefined()

      // Verify backup exists
      const backupExists = await fs.pathExists(result.backupPath!)
      expect(backupExists).toBe(true)

      // Verify backup contains old value
      const backupContent = await fs.readFile(result.backupPath!, 'utf8')
      expect(backupContent).toContain('KEY1="value1"')

      // Verify main file has new value
      const mainContent = await manager.readEnvFile(envPath)
      expect(mainContent.get('KEY1')).toBe('new-value')

      // Recovery: restore from backup
      await manager.copyEnvFile(result.backupPath!, envPath)
      const restoredContent = await manager.readEnvFile(envPath)
      expect(restoredContent.get('KEY1')).toBe('value1')
    })

    it('should handle special characters and escaping', async () => {
      const envPath = path.join(testDir, '.env')

      const specialValues = [
        ['QUOTED', 'value with "quotes"'],
        ['NEWLINES', 'value\nwith\nnewlines'],
        ['SPECIAL', 'value with $pecial ch@rs!'],
        ['EQUALS', 'value=with=equals'],
        ['SPACES', '  value with spaces  '],
      ]

      for (const [key, value] of specialValues) {
        const result = await manager.setEnvVar(envPath, key, value)
        expect(result.success).toBe(true)
      }

      // Read back and verify
      const envContent = await manager.readEnvFile(envPath)

      for (const [key, value] of specialValues) {
        expect(envContent.get(key)).toBe(value)
      }
    })

    it('should handle port conflicts and calculations', async () => {
      const env1Path = path.join(testDir, '.env.workspace1')
      const env2Path = path.join(testDir, '.env.workspace2')
      const env3Path = path.join(testDir, '.env.workspace3')

      // Create workspaces with different issue numbers
      const port1 = await manager.setPortForWorkspace(env1Path, 10)
      const port2 = await manager.setPortForWorkspace(env2Path, 20)
      const port3 = await manager.setPortForWorkspace(env3Path, 30)

      expect(port1).toBe(3010)
      expect(port2).toBe(3020)
      expect(port3).toBe(3030)

      // Verify all ports are unique
      expect(new Set([port1, port2, port3]).size).toBe(3)

      // Verify ports are written to files
      const env1 = await manager.readEnvFile(env1Path)
      const env2 = await manager.readEnvFile(env2Path)
      const env3 = await manager.readEnvFile(env3Path)

      expect(env1.get('PORT')).toBe('3010')
      expect(env2.get('PORT')).toBe('3020')
      expect(env3.get('PORT')).toBe('3030')
    })
  })

  describe('error handling', () => {
    it('should handle missing directories gracefully', async () => {
      const envPath = path.join(testDir, 'nonexistent', 'directory', '.env')

      // Should fail because parent directory doesn't exist
      const result = await manager.setEnvVar(envPath, 'KEY', 'value')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('no such file or directory')
    })

    it('should handle read-only files', async () => {
      const envPath = path.join(testDir, '.env')

      await fs.writeFile(envPath, 'KEY="value"', 'utf8')
      await fs.chmod(envPath, 0o444) // Read-only

      const result = await manager.setEnvVar(envPath, 'KEY', 'new-value')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()

      // Cleanup
      await fs.chmod(envPath, 0o644)
    })

    it('should validate file and report errors', async () => {
      const envPath = path.join(testDir, '.env')

      // Create file with invalid variable names
      const invalidContent = `VALID_KEY="value"
123INVALID="value"
ANOTHER-INVALID="value"
_VALID_KEY="value"`

      await fs.writeFile(envPath, invalidContent, 'utf8')

      const validation = await manager.validateEnvFile(envPath)

      expect(validation.valid).toBe(false)
      expect(validation.errors.length).toBeGreaterThan(0)
      expect(validation.errors.some(e => e.includes('123INVALID'))).toBe(true)
      expect(validation.errors.some(e => e.includes('ANOTHER-INVALID'))).toBe(true)
    })
  })

  describe('bash script parity', () => {
    it('should produce identical output to setEnvVar bash function', async () => {
      const envPath = path.join(testDir, '.env')

      // Test case 1: Create new file
      const result1 = await manager.setEnvVar(envPath, 'KEY', 'value')
      expect(result1.success).toBe(true)

      let content = await fs.readFile(envPath, 'utf8')
      expect(content).toBe('KEY="value"')

      // Test case 2: Add variable to existing file
      const result2 = await manager.setEnvVar(envPath, 'KEY2', 'value2')
      expect(result2.success).toBe(true)

      content = await fs.readFile(envPath, 'utf8')
      expect(content).toContain('KEY="value"')
      expect(content).toContain('KEY2="value2"')

      // Test case 3: Update existing variable
      const result3 = await manager.setEnvVar(envPath, 'KEY', 'new-value')
      expect(result3.success).toBe(true)

      content = await fs.readFile(envPath, 'utf8')
      expect(content).toContain('KEY="new-value"')
      expect(content).not.toContain('KEY="value"')
      expect(content).toContain('KEY2="value2"')

      // Verify the bash script behavior: always quote values
      const lines = content.split('\n').filter(l => l.trim())
      for (const line of lines) {
        if (line.includes('=')) {
          const [, value] = line.split('=')
          expect(value.startsWith('"')).toBe(true)
          expect(value.endsWith('"')).toBe(true)
        }
      }
    })

    it('should escape quotes like bash script does', async () => {
      const envPath = path.join(testDir, '.env')

      // The bash script uses: escaped_value="${var_value//\"/\\\"}"
      const valueWithQuotes = 'value with "quotes" inside'
      const result = await manager.setEnvVar(envPath, 'KEY', valueWithQuotes)
      expect(result.success).toBe(true)

      const fileContent = await fs.readFile(envPath, 'utf8')
      expect(fileContent).toBe('KEY="value with \\"quotes\\" inside"')

      // Verify we can read it back correctly
      const envContent = await manager.readEnvFile(envPath)
      expect(envContent.get('KEY')).toBe(valueWithQuotes)
    })
  })
})
