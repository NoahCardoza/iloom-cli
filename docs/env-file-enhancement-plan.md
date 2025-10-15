# Environment File Enhancement Implementation Plan

## Executive Summary

This plan details the enhancement of Hatchbox AI's environment file handling to support multiple environment file variants following Next.js/standard environment file conventions. Currently, only `.env` files are copied to worktrees. This enhancement will add support for environment-specific files (`.env.development`, `.env.production`) and local override files (`.env.local`, `.env.development.local`, etc.).

## 1. Research Findings: Next.js Environment File Loading Order

### Official Next.js Environment File Conventions

Based on the official Next.js documentation and the `dotenv-flow` package (already used in this project), the environment file loading order is:

**Priority Order (Highest to Lowest):**

1. `.env.[NODE_ENV].local` (e.g., `.env.development.local`, `.env.production.local`)
2. `.env.local` (NOT loaded when `NODE_ENV=test`)
3. `.env.[NODE_ENV]` (e.g., `.env.development`, `.env.production`, `.env.test`)
4. `.env`

**Key Characteristics:**

- **Higher priority files override lower priority files** for the same variable
- **`.local` files are for local overrides** and typically contain secrets or machine-specific config
- **`.env.test.local` and `.env.test`** are loaded during testing (`NODE_ENV=test`)
- **`.env.local` is skipped during test** to ensure consistent test environments
- **All files are optional** - the application should work even if none exist

### Standard .gitignore Conventions

Examining the project's `.gitignore`:

```
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
```

**Pattern:**
- `.env` - Sometimes committed (with example values), sometimes ignored (if it contains secrets)
- `.env.local` - ALWAYS ignored (contains secrets/local overrides)
- `.env.[environment].local` - ALWAYS ignored (contains environment-specific secrets)
- `.env.[environment]` - Usually committed (contains environment-specific defaults without secrets)

### Current Implementation

The project already uses `dotenv-flow` package (v4.1.0) which implements this exact loading strategy:

**File:** `/Users/adam/Documents/Projects/hatchbox-ai/main/src/utils/env.ts`
**Lines:** 135-194

```typescript
export function loadEnvIntoProcess(options?: {
  path?: string
  nodeEnv?: string
  defaultNodeEnv?: string
}): { parsed?: Record<string, string>; error?: Error } {
  // Uses dotenv-flow which automatically handles the priority order
  const result = dotenvFlow.config(configOptions)
  // ...
}
```

**Current Usage:**
- Line 64 in `HatchboxManager.ts`: Loads main .env variables into process.env
- Line 362 in `HatchboxManager.ts`: Copies only `.env` file to worktree
- Line 373 in `HatchboxManager.ts`: Sets PORT variable in worktree's `.env`

## 2. Current Implementation Analysis

### 2.1 Location of Current .env Copying Logic

**File:** `/Users/adam/Documents/Projects/hatchbox-ai/main/src/lib/HatchboxManager.ts`
**Method:** `setupEnvironment()` (Lines 353-374)

```typescript
private async setupEnvironment(
  worktreePath: string,
  input: CreateHatchboxInput
): Promise<number> {
  const envFilePath = path.join(worktreePath, '.env')

  // First, copy main .env file to worktree (like bash script lines 715-725)
  try {
    const mainEnvPath = path.join(process.cwd(), '.env')
    await this.environment.copyEnvFile(mainEnvPath, envFilePath)
    logger.info('Copied main .env file to worktree')
  } catch (error) {
    // Handle gracefully if main .env doesn't exist
    logger.warn(`Warning: Failed to copy main .env file: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }

  // Then set/update the PORT variable in the copied file
  const issueNumber = input.type === 'issue' ? (input.identifier as number) : undefined
  const prNumber = input.type === 'pr' ? (input.identifier as number) : undefined

  return await this.environment.setPortForWorkspace(envFilePath, issueNumber, prNumber)
}
```

**Key Observations:**
- Only copies `.env` file
- Gracefully handles missing `.env` file
- Sets PORT variable after copying
- Called from line 72 in `createHatchbox()` method

### 2.2 EnvironmentManager Implementation

**File:** `/Users/adam/Documents/Projects/hatchbox-ai/main/src/lib/EnvironmentManager.ts`

**Relevant Methods:**
- `copyEnvFile()` (Lines 129-142): Generic file copy utility
- `setEnvVar()` (Lines 22-108): Sets/updates a variable in an env file
- `readEnvFile()` (Lines 113-124): Parses env file into Map

**Current Limitations:**
- `copyEnvFile()` only copies a single file at a time
- No awareness of multiple environment file variants
- No logic to handle priority or merging of multiple files

### 2.3 Test Coverage

**Test Files:**
- `EnvironmentManager.test.ts` (359 lines): Unit tests with mocked fs
- `EnvironmentManager.integration.test.ts` (273 lines): Integration tests with real filesystem
- `EnvironmentManager.property.test.ts`: Property-based tests (not reviewed)

**Current Test Coverage:**
- Tests single `.env` file operations
- Tests copying, reading, writing, validation
- Tests PORT assignment
- Tests bash script parity
- **Missing:** Tests for multiple environment file handling

## 3. Detailed Implementation Plan

### 3.1 Design Decisions

#### Which Files to Copy?

Based on analysis, we should copy files that:
1. **Exist in the main repository** (source files must exist)
2. **Are needed for the worktree to function** (contain config, not just secrets)
3. **Follow the same priority order as Next.js/dotenv-flow**

**Proposed Files to Copy:**

| File Pattern | Copy? | Reason |
|--------------|-------|--------|
| `.env` | ✅ YES | Base configuration, often committed, safe to copy |
| `.env.local` | ✅ YES | Local overrides, may contain secrets but needed for functionality |
| `.env.development` | ✅ YES | Development defaults, usually committed |
| `.env.development.local` | ✅ YES | Local dev overrides, needed for local dev environment |
| `.env.production` | ✅ YES | Production config, usually committed |
| `.env.production.local` | ⚠️ CONDITIONAL | Only if exists and we're in production mode |
| `.env.test` | ⚠️ CONDITIONAL | Only if exists and we're in test mode |
| `.env.test.local` | ⚠️ CONDITIONAL | Only if exists and we're in test mode |

**Rationale for copying `.local` files:**
- Worktrees are isolated development environments
- Developers need the same local configuration in worktrees as in main repo
- Secrets in `.local` files are already on the developer's machine (not a security risk)
- Without `.local` files, worktree may not function correctly

#### NODE_ENV Determination

**Default Strategy:**
- Default to `NODE_ENV=development` for new worktrees (matches bash script behavior)
- Allow override via input options (future enhancement)
- Respect existing `NODE_ENV` from main process if set

#### Environment Variable Update Strategy

**Critical Requirement:** Support updating ANY environment variable with intelligent file selection.

**Strategy:**
1. Copy all environment files first (preserving their original values)
2. Then update specific variables using a two-step logic:
   - **If variable exists somewhere:** Update it in the highest-priority file where it's currently defined
   - **If variable doesn't exist anywhere:** Add it to the highest-priority file that exists

**Examples:**

**Scenario 1:** `DATABASE_URL` exists in `.env.local`
- Action: Update `DATABASE_URL` in `.env.local` (not in `.env.development.local` even though it's higher priority)
- Reason: Preserve the file where it's already defined

**Scenario 2:** `PORT` exists in `.env` and `.env.local`
- Action: Update `PORT` in `.env.local` (highest priority file where it's defined)
- Reason: The highest-priority file wins

**Scenario 3:** `NEW_VAR` doesn't exist anywhere, and `.env.development.local` exists
- Action: Add `NEW_VAR` to `.env.development.local` (highest priority file)
- Reason: New variables go to the most specific file available

**Scenario 4:** `NEW_VAR` doesn't exist anywhere, only `.env` exists
- Action: Add `NEW_VAR` to `.env` (highest priority file that exists)
- Reason: Add to the only available file

**Rationale:**
- Respects existing configuration patterns (variables stay where developers put them)
- Ensures highest-priority override for existing variables
- New variables follow dotenv-flow priority conventions
- Predictable behavior that aligns with developer expectations

### 3.2 API Design

#### New Method: `copyAllEnvFiles()`

**File:** `/Users/adam/Documents/Projects/hatchbox-ai/main/src/lib/EnvironmentManager.ts`

```typescript
/**
 * Copy all applicable environment files from source to destination directory
 * Follows Next.js/dotenv-flow conventions and priority order
 *
 * @param sourceDir - Source directory (e.g., main repo root)
 * @param destDir - Destination directory (e.g., worktree root)
 * @param options - Optional configuration
 * @returns Array of files that were successfully copied
 */
async copyAllEnvFiles(
  sourceDir: string,
  destDir: string,
  options?: {
    nodeEnv?: string           // Target NODE_ENV (default: 'development')
    overwrite?: boolean        // Overwrite existing files (default: true)
    skipLocalFiles?: boolean   // Skip .local files (default: false)
  }
): Promise<string[]>
```

**Implementation Details:**

1. **Determine NODE_ENV** (default: 'development')
2. **Build list of files to copy** in priority order:
   ```typescript
   const filesToCopy = [
     '.env',                              // Base
     `.env.${nodeEnv}`,                   // Environment-specific
     '.env.local',                        // Local overrides
     `.env.${nodeEnv}.local`,             // Environment-specific local overrides
   ]
   ```
3. **Filter to files that exist** in sourceDir
4. **Copy each file** using existing `copyEnvFile()` method
5. **Return array of successfully copied files** for logging/testing

**Error Handling:**
- If a file copy fails, log warning but continue with remaining files
- If NO files are copied successfully, log warning but don't throw (matches current behavior)
- Return empty array if no files exist (graceful degradation)

#### New Method: `setEnvVarAcrossFiles()`

**Generalized method** to set ANY environment variable across environment files with intelligent file selection:

```typescript
/**
 * Set an environment variable across applicable environment files
 * Follows a two-step logic:
 * 1. If variable exists: Update it in the highest-priority file where it's defined
 * 2. If variable doesn't exist: Add it to the highest-priority file that exists
 *
 * @param destDir - Directory containing .env files
 * @param varName - Name of the environment variable to set
 * @param value - Value to set
 * @param options - Optional configuration
 * @returns Object containing the file where variable was set and the value
 */
async setEnvVarAcrossFiles(
  destDir: string,
  varName: string,
  value: string,
  options?: {
    nodeEnv?: string           // Target NODE_ENV (default: 'development')
    targetFile?: string        // Override: specific file to update (default: auto-detect)
  }
): Promise<{ file: string; value: string }>
```

**Implementation Strategy:**

```typescript
async setEnvVarAcrossFiles(
  destDir: string,
  varName: string,
  value: string,
  options?: { nodeEnv?: string; targetFile?: string }
): Promise<{ file: string; value: string }> {
  const nodeEnv = options?.nodeEnv ?? 'development'

  // If targetFile is explicitly provided, use it
  if (options?.targetFile) {
    const targetPath = path.join(destDir, options.targetFile)
    await this.setEnvVar(targetPath, varName, value)
    return { file: options.targetFile, value }
  }

  // Priority order for files
  const priorityFiles = [
    `.env.${nodeEnv}.local`,   // Highest priority for this NODE_ENV
    '.env.local',              // Second highest priority
    `.env.${nodeEnv}`,         // Third priority
    '.env',                    // Lowest priority
  ]

  // Step 1: Find all files where the variable currently exists
  const filesWithVar: string[] = []
  for (const file of priorityFiles) {
    const filePath = path.join(destDir, file)
    if (await fs.pathExists(filePath)) {
      const envVars = await this.readEnvFile(filePath)
      if (envVars.has(varName)) {
        filesWithVar.push(file)
      }
    }
  }

  // Step 2a: If variable exists, update it in the highest-priority file where it's defined
  if (filesWithVar.length > 0) {
    const targetFile = filesWithVar[0] // Already in priority order
    await this.setEnvVar(path.join(destDir, targetFile), varName, value)
    return { file: targetFile, value }
  }

  // Step 2b: If variable doesn't exist, add it to highest-priority file that exists
  for (const file of priorityFiles) {
    const filePath = path.join(destDir, file)
    if (await fs.pathExists(filePath)) {
      await this.setEnvVar(filePath, varName, value)
      return { file, value }
    }
  }

  // Edge case: No env files exist
  throw new Error(`No environment files found in ${destDir}`)
}
```

**Backward Compatible Helper: `setPortForAllEnvFiles()`**

For backward compatibility and convenience, provide a specialized PORT setter:

```typescript
/**
 * Set PORT variable for a worktree (convenience wrapper around setEnvVarAcrossFiles)
 * Calculates port based on issue/PR number and sets it intelligently
 *
 * @param destDir - Directory containing .env files
 * @param issueNumber - Issue number for port calculation
 * @param prNumber - PR number for port calculation
 * @param options - Optional configuration
 * @returns The calculated port number
 */
async setPortForAllEnvFiles(
  destDir: string,
  issueNumber?: number,
  prNumber?: number,
  options?: {
    nodeEnv?: string
    targetFile?: string
  }
): Promise<number> {
  const port = this.calculatePortForWorkspace(issueNumber, prNumber)
  await this.setEnvVarAcrossFiles(destDir, 'PORT', String(port), options)
  return port
}
```

### 3.3 Integration Points

#### Update `HatchboxManager.setupEnvironment()`

**File:** `/Users/adam/Documents/Projects/hatchbox-ai/main/src/lib/HatchboxManager.ts`
**Lines:** 353-374

**Current Implementation:**
```typescript
private async setupEnvironment(
  worktreePath: string,
  input: CreateHatchboxInput
): Promise<number> {
  const envFilePath = path.join(worktreePath, '.env')

  // Copy single .env file
  try {
    const mainEnvPath = path.join(process.cwd(), '.env')
    await this.environment.copyEnvFile(mainEnvPath, envFilePath)
    logger.info('Copied main .env file to worktree')
  } catch (error) {
    logger.warn(`Warning: Failed to copy main .env file: ...`)
  }

  // Set PORT
  return await this.environment.setPortForWorkspace(envFilePath, issueNumber, prNumber)
}
```

**Enhanced Implementation:**
```typescript
private async setupEnvironment(
  worktreePath: string,
  input: CreateHatchboxInput
): Promise<number> {
  const sourceDir = process.cwd()
  const destDir = worktreePath

  // Determine NODE_ENV for worktree (default: development)
  const nodeEnv = input.options?.nodeEnv ?? 'development'

  // Copy all applicable environment files
  try {
    const copiedFiles = await this.environment.copyAllEnvFiles(
      sourceDir,
      destDir,
      { nodeEnv }
    )

    if (copiedFiles.length > 0) {
      logger.info(`Copied ${copiedFiles.length} environment file(s): ${copiedFiles.join(', ')}`)
    } else {
      logger.warn('Warning: No environment files found to copy')
    }
  } catch (error) {
    // Graceful degradation - matches current behavior
    logger.warn(`Warning: Failed to copy environment files: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }

  // Set PORT in appropriate file(s)
  const issueNumber = input.type === 'issue' ? (input.identifier as number) : undefined
  const prNumber = input.type === 'pr' ? (input.identifier as number) : undefined

  return await this.environment.setPortForAllEnvFiles(
    destDir,
    issueNumber,
    prNumber,
    { nodeEnv }
  )
}
```

**Key Changes:**
- Use `copyAllEnvFiles()` instead of single file copy
- Pass `nodeEnv` to both copy and PORT methods
- Improved logging with file count and names
- Maintains graceful error handling

### 3.4 Testing Strategy

#### Unit Tests

**File:** `/Users/adam/Documents/Projects/hatchbox-ai/main/src/lib/EnvironmentManager.test.ts`

**New Test Suite: `describe('copyAllEnvFiles', () => {})`**

Tests to add:

1. ✅ **Should copy all existing environment files in correct order**
   ```typescript
   it('should copy all existing environment files', async () => {
     // Setup: Mock fs.pathExists to return true for multiple files
     // Setup: Mock fs.copy to succeed

     const result = await manager.copyAllEnvFiles('/source', '/dest')

     // Assert: All files copied
     expect(result).toContain('.env')
     expect(result).toContain('.env.development')
     expect(result).toContain('.env.local')
     expect(result).toContain('.env.development.local')
   })
   ```

2. ✅ **Should handle missing files gracefully**
   ```typescript
   it('should only copy files that exist', async () => {
     // Setup: Mock fs.pathExists to return true only for .env

     const result = await manager.copyAllEnvFiles('/source', '/dest')

     expect(result).toEqual(['.env'])
   })
   ```

3. ✅ **Should respect nodeEnv option**
   ```typescript
   it('should copy production files when nodeEnv=production', async () => {
     const result = await manager.copyAllEnvFiles('/source', '/dest', {
       nodeEnv: 'production'
     })

     expect(result).toContain('.env.production')
     expect(result).toContain('.env.production.local')
     expect(result).not.toContain('.env.development')
   })
   ```

4. ✅ **Should return empty array when no files exist**
   ```typescript
   it('should return empty array when no env files exist', async () => {
     // Mock all pathExists to return false

     const result = await manager.copyAllEnvFiles('/source', '/dest')

     expect(result).toEqual([])
     expect(logger.warn).toHaveBeenCalled()
   })
   ```

5. ✅ **Should respect skipLocalFiles option**
   ```typescript
   it('should skip .local files when skipLocalFiles=true', async () => {
     const result = await manager.copyAllEnvFiles('/source', '/dest', {
       skipLocalFiles: true
     })

     expect(result).not.toContain('.env.local')
     expect(result).not.toContain('.env.development.local')
   })
   ```

**New Test Suite: `describe('setEnvVarAcrossFiles', () => {})`**

Tests to add:

1. ✅ **Should update variable in highest priority file where it exists**
   ```typescript
   it('should update DATABASE_URL in .env.local when it exists there', async () => {
     // Mock: DATABASE_URL exists in .env.local (but not in .env.development.local)
     // Mock: Both .env and .env.local exist

     const result = await manager.setEnvVarAcrossFiles(
       '/dest',
       'DATABASE_URL',
       'postgres://newurl',
       { nodeEnv: 'development' }
     )

     expect(result.file).toBe('.env.local')
     expect(result.value).toBe('postgres://newurl')
     expect(vi.mocked(fs.writeFile)).toHaveBeenCalledWith(
       '/dest/.env.local',
       expect.stringContaining('DATABASE_URL="postgres://newurl"'),
       'utf8'
     )
   })
   ```

2. ✅ **Should update variable in highest priority file when it exists in multiple files**
   ```typescript
   it('should update PORT in .env.local when it exists in both .env and .env.local', async () => {
     // Mock: PORT exists in both .env and .env.local
     // Mock: .env.development.local doesn't exist

     const result = await manager.setEnvVarAcrossFiles('/dest', 'PORT', '3042')

     expect(result.file).toBe('.env.local')
     expect(vi.mocked(fs.writeFile)).toHaveBeenCalledWith(
       '/dest/.env.local',
       expect.stringContaining('PORT="3042"'),
       'utf8'
     )
   })
   ```

3. ✅ **Should add new variable to highest priority file that exists**
   ```typescript
   it('should add NEW_VAR to .env.development.local when it exists', async () => {
     // Mock: NEW_VAR doesn't exist anywhere
     // Mock: .env.development.local exists

     const result = await manager.setEnvVarAcrossFiles(
       '/dest',
       'NEW_VAR',
       'new-value',
       { nodeEnv: 'development' }
     )

     expect(result.file).toBe('.env.development.local')
     expect(vi.mocked(fs.writeFile)).toHaveBeenCalledWith(
       '/dest/.env.development.local',
       expect.stringContaining('NEW_VAR="new-value"'),
       'utf8'
     )
   })
   ```

4. ✅ **Should add new variable to .env if only .env exists**
   ```typescript
   it('should add NEW_VAR to .env when only .env exists', async () => {
     // Mock: NEW_VAR doesn't exist anywhere
     // Mock: Only .env exists

     const result = await manager.setEnvVarAcrossFiles('/dest', 'NEW_VAR', 'value')

     expect(result.file).toBe('.env')
   })
   ```

5. ✅ **Should respect targetFile override**
   ```typescript
   it('should use targetFile when explicitly provided', async () => {
     // Mock: Multiple files exist

     const result = await manager.setEnvVarAcrossFiles(
       '/dest',
       'VAR',
       'value',
       { targetFile: '.env.production.local' }
     )

     expect(result.file).toBe('.env.production.local')
   })
   ```

6. ✅ **Should handle case where no env files exist**
   ```typescript
   it('should throw error when no env files exist', async () => {
     // Mock: No files exist

     await expect(
       manager.setEnvVarAcrossFiles('/dest', 'VAR', 'value')
     ).rejects.toThrow('No environment files found')
   })
   ```

**New Test Suite: `describe('setPortForAllEnvFiles', () => {})`**

Tests for backward compatibility:

1. ✅ **Should set PORT using generalized method**
   ```typescript
   it('should calculate and set PORT correctly', async () => {
     // Mock: .env.local exists
     vi.spyOn(manager, 'setEnvVarAcrossFiles').mockResolvedValue({
       file: '.env.local',
       value: '3042'
     })

     const port = await manager.setPortForAllEnvFiles('/dest', 42)

     expect(port).toBe(3042)
     expect(manager.setEnvVarAcrossFiles).toHaveBeenCalledWith(
       '/dest',
       'PORT',
       '3042',
       undefined
     )
   })
   ```

2. ✅ **Should pass through options to setEnvVarAcrossFiles**
   ```typescript
   it('should pass nodeEnv and targetFile options', async () => {
     vi.spyOn(manager, 'setEnvVarAcrossFiles').mockResolvedValue({
       file: '.env.production.local',
       value: '3042'
     })

     await manager.setPortForAllEnvFiles('/dest', 42, undefined, {
       nodeEnv: 'production',
       targetFile: '.env.production.local'
     })

     expect(manager.setEnvVarAcrossFiles).toHaveBeenCalledWith(
       '/dest',
       'PORT',
       '3042',
       { nodeEnv: 'production', targetFile: '.env.production.local' }
     )
   })
   ```

#### Integration Tests

**File:** `/Users/adam/Documents/Projects/hatchbox-ai/main/src/lib/EnvironmentManager.integration.test.ts`

**New Test Suite: `describe('multiple environment files', () => {})`**

Tests to add:

1. ✅ **Complete workflow with multiple env files and variable updates**
   ```typescript
   it('should handle complete workflow with multiple env files', async () => {
     // Create source directory with multiple .env files
     const sourceDir = path.join(testDir, 'source')
     const destDir = path.join(testDir, 'dest')
     await fs.ensureDir(sourceDir)
     await fs.ensureDir(destDir)

     // Create test files with different variables
     await fs.writeFile(path.join(sourceDir, '.env'), 'BASE_VAR="base"\nPORT="3000"')
     await fs.writeFile(path.join(sourceDir, '.env.development'), 'DEV_VAR="dev"')
     await fs.writeFile(path.join(sourceDir, '.env.local'), 'SECRET="local-secret"\nDATABASE_URL="postgres://local"')

     // Copy all files
     const copiedFiles = await manager.copyAllEnvFiles(sourceDir, destDir)
     expect(copiedFiles.length).toBe(3)

     // Test Scenario 1: Update PORT (exists in .env and .env.local)
     // Should update in .env.local (highest priority where it exists)
     const portResult = await manager.setEnvVarAcrossFiles(destDir, 'PORT', '3042')
     expect(portResult.file).toBe('.env.local')

     // Test Scenario 2: Update DATABASE_URL (exists only in .env.local)
     // Should update in .env.local (where it's defined)
     const dbResult = await manager.setEnvVarAcrossFiles(destDir, 'DATABASE_URL', 'postgres://worktree')
     expect(dbResult.file).toBe('.env.local')

     // Test Scenario 3: Add NEW_VAR (doesn't exist anywhere)
     // Should add to highest priority file that exists (.env.local)
     const newVarResult = await manager.setEnvVarAcrossFiles(destDir, 'NEW_VAR', 'new-value')
     expect(newVarResult.file).toBe('.env.local')

     // Verify .env.local has all updates
     const envLocalContent = await fs.readFile(path.join(destDir, '.env.local'), 'utf8')
     expect(envLocalContent).toContain('PORT="3042"')
     expect(envLocalContent).toContain('DATABASE_URL="postgres://worktree"')
     expect(envLocalContent).toContain('NEW_VAR="new-value"')
     expect(envLocalContent).toContain('SECRET="local-secret"')

     // Verify .env still has original PORT (not updated because .env.local is higher priority)
     const envContent = await fs.readFile(path.join(destDir, '.env'), 'utf8')
     expect(envContent).toContain('PORT="3000"') // Original PORT preserved
   })
   ```

2. ✅ **Environment file priority verification**
   ```typescript
   it('should respect dotenv-flow priority when loading', async () => {
     // Create files with conflicting values
     await fs.writeFile(path.join(testDir, '.env'), 'VAR="base"')
     await fs.writeFile(path.join(testDir, '.env.development'), 'VAR="dev"')
     await fs.writeFile(path.join(testDir, '.env.local'), 'VAR="local"')
     await fs.writeFile(path.join(testDir, '.env.development.local'), 'VAR="dev-local"')

     // Load using dotenv-flow
     const result = loadEnvIntoProcess({ path: testDir, nodeEnv: 'development' })

     // Verify highest priority wins
     expect(result.parsed?.VAR).toBe('dev-local')
   })
   ```

3. ✅ **Bash script parity with multiple files**
   ```typescript
   it('should produce same result as bash script with multiple env files', async () => {
     // Test that our implementation matches bash script behavior
     // Bash script only copies .env, so after enhancement we should:
     // 1. Copy all files (new behavior)
     // 2. Still work when only .env exists (backward compatibility)

     await fs.writeFile(path.join(testDir, '.env'), 'VAR="value"')

     const copiedFiles = await manager.copyAllEnvFiles(testDir, path.join(testDir, 'dest'))

     // Should work with just .env (backward compatible)
     expect(copiedFiles).toContain('.env')
   })
   ```

#### HatchboxManager Integration Tests

**File:** `/Users/adam/Documents/Projects/hatchbox-ai/main/src/lib/HatchboxManager.test.ts`

**Enhanced Existing Tests:**

1. ✅ **Update mock setup to handle new methods**
   ```typescript
   const mockEnvironment = {
     copyEnvFile: vi.fn().mockResolvedValue(undefined),
     copyAllEnvFiles: vi.fn().mockResolvedValue(['.env', '.env.local']), // NEW
     setPortForWorkspace: vi.fn().mockResolvedValue(3042),
     setEnvVarAcrossFiles: vi.fn().mockResolvedValue({ file: '.env.local', value: '3042' }), // NEW
     setPortForAllEnvFiles: vi.fn().mockResolvedValue(3042), // NEW (wrapper)
     // ... other methods
   }
   ```

2. ✅ **Verify new methods are called correctly**
   ```typescript
   it('should copy all environment files when creating hatchbox', async () => {
     await manager.createHatchbox(input)

     expect(mockEnvironment.copyAllEnvFiles).toHaveBeenCalledWith(
       expect.stringContaining(process.cwd()),
       expect.any(String),
       expect.objectContaining({ nodeEnv: 'development' })
     )
   })

   it('should set environment variables intelligently', async () => {
     await manager.createHatchbox(input)

     expect(mockEnvironment.setPortForAllEnvFiles).toHaveBeenCalledWith(
       expect.any(String),
       expect.any(Number),
       undefined,
       expect.objectContaining({ nodeEnv: 'development' })
     )
   })
   ```

### 3.5 Documentation Updates

#### Files to Update:

1. **README.md** - Add note about environment file handling
2. **CLAUDE.md** - Update development guidelines if needed
3. **docs/technical-architecture.md** - Update EnvironmentManager section
4. **JSDoc comments** - Add comprehensive documentation to new methods

#### Example JSDoc:

```typescript
/**
 * Copy all applicable environment files from source to destination directory.
 * Follows Next.js and dotenv-flow conventions for environment file precedence:
 *
 * Priority Order (highest to lowest):
 * 1. .env.[NODE_ENV].local (e.g., .env.development.local)
 * 2. .env.local
 * 3. .env.[NODE_ENV] (e.g., .env.development)
 * 4. .env
 *
 * Only copies files that exist in the source directory. Missing files are
 * skipped without error (graceful degradation).
 *
 * @param sourceDir - Source directory containing .env files (e.g., main repo root)
 * @param destDir - Destination directory for copied files (e.g., worktree root)
 * @param options - Optional configuration
 * @param options.nodeEnv - Target NODE_ENV (default: 'development')
 * @param options.overwrite - Whether to overwrite existing files (default: true)
 * @param options.skipLocalFiles - Skip copying .local files (default: false)
 * @returns Array of filenames that were successfully copied
 *
 * @example
 * ```typescript
 * const copiedFiles = await envManager.copyAllEnvFiles(
 *   '/path/to/main/repo',
 *   '/path/to/worktree',
 *   { nodeEnv: 'development' }
 * )
 * // copiedFiles: ['.env', '.env.development', '.env.local', '.env.development.local']
 * ```
 */

/**
 * Set an environment variable intelligently across environment files.
 * Uses two-step logic:
 * 1. If variable exists: Update it in the highest-priority file where it's defined
 * 2. If variable doesn't exist: Add it to the highest-priority file that exists
 *
 * @param destDir - Directory containing .env files
 * @param varName - Name of the environment variable to set
 * @param value - Value to set
 * @param options - Optional configuration
 * @param options.nodeEnv - Target NODE_ENV (default: 'development')
 * @param options.targetFile - Override: specific file to update (default: auto-detect)
 * @returns Object containing the file where variable was set and the value
 *
 * @example Scenario 1: Update existing variable in highest-priority file
 * ```typescript
 * // DATABASE_URL exists in .env.local
 * const result = await envManager.setEnvVarAcrossFiles(
 *   '/worktree',
 *   'DATABASE_URL',
 *   'postgres://worktree-db'
 * )
 * // result: { file: '.env.local', value: 'postgres://worktree-db' }
 * ```
 *
 * @example Scenario 2: Update variable that exists in multiple files
 * ```typescript
 * // PORT exists in .env and .env.local
 * const result = await envManager.setEnvVarAcrossFiles(
 *   '/worktree',
 *   'PORT',
 *   '3042'
 * )
 * // result: { file: '.env.local', value: '3042' }
 * // (Updates in .env.local, the highest-priority file where it exists)
 * ```
 *
 * @example Scenario 3: Add new variable to highest-priority file
 * ```typescript
 * // NEW_VAR doesn't exist anywhere, .env.development.local exists
 * const result = await envManager.setEnvVarAcrossFiles(
 *   '/worktree',
 *   'NEW_VAR',
 *   'value',
 *   { nodeEnv: 'development' }
 * )
 * // result: { file: '.env.development.local', value: 'value' }
 * ```
 */
```

## 4. Edge Cases and Special Considerations

### 4.1 Edge Cases

| Scenario | Handling Strategy |
|----------|------------------|
| **No env files exist in main repo** | Log warning, continue without error (matches current behavior) |
| **Only .env.local exists (no .env)** | Copy it, use it for PORT - valid configuration |
| **Existing worktree with old .env only** | When reusing worktree, don't copy files again (skip env setup) |
| **Mixed file existence** (.env and .env.production but not .env.development) | Copy only files that exist, skip missing ones |
| **NODE_ENV=production in dev workflow** | Respect it, copy production files. User's choice. |
| **Very large .env.local with secrets** | Copy it (needed for functionality), already on dev's machine (not a security risk) |
| **Conflicting PORT values across files** | Our PORT override in highest-priority file wins |
| **File permissions issues** | Catch and log error, continue with other files |
| **Symbolic links to .env files** | fs.copy() will follow symlinks, copying target content (acceptable) |
| **Binary or malformed .env files** | Current parseEnvFile() will skip invalid lines (acceptable) |

### 4.2 Security Considerations

**Question:** Should we copy `.local` files that might contain secrets?

**Answer:** YES, because:
1. Secrets are already on the developer's machine (in main repo)
2. Worktrees are on the same filesystem with same permissions
3. Worktrees need same configuration as main repo to function
4. NOT copying .local files would break functionality (missing DB credentials, API keys, etc.)
5. Hatchbox is a development tool, not a deployment tool

**Mitigation:**
- Ensure `.local` files are in `.gitignore` (already done)
- Document that worktrees share the same security profile as main repo
- Consider adding option `skipLocalFiles: true` for paranoid users (but default to false)

### 4.3 Performance Considerations

**Impact:** Copying 4 files instead of 1 file per worktree creation

**Analysis:**
- File size: .env files are typically < 10 KB
- File count: Usually 2-4 files (not all exist in every project)
- Copy time: < 10ms per file on modern filesystem
- **Total impact:** Negligible (< 40ms per worktree creation)

**Optimization:** Not needed - performance impact is minimal

### 4.4 Backward Compatibility

**Breaking Changes:** None

**Compatibility:**
- ✅ Existing code will continue to work (new methods don't affect old methods)
- ✅ Projects with only `.env` will work exactly as before
- ✅ Projects with multiple env files will get enhanced behavior automatically
- ✅ Tests that mock old methods will continue to pass
- ✅ Bash script behavior is maintained (copies at least `.env`)

**Migration Path:** None needed - enhancement is additive

## 5. Implementation Checklist

### Phase 1: Core Implementation

- [ ] **1.1** Implement `copyAllEnvFiles()` method in `EnvironmentManager.ts`
  - [ ] Add method signature with proper types
  - [ ] Implement file existence checking logic
  - [ ] Implement file copying in priority order
  - [ ] Add error handling and logging
  - [ ] Add JSDoc documentation

- [ ] **1.2** Implement `setEnvVarAcrossFiles()` method in `EnvironmentManager.ts`
  - [ ] Add method signature with proper types
  - [ ] Implement variable existence detection across files
  - [ ] Implement file priority detection logic (highest priority where var exists)
  - [ ] Implement fallback logic (highest priority file if var doesn't exist)
  - [ ] Implement variable setting in target file
  - [ ] Add error handling and logging
  - [ ] Add JSDoc documentation with examples

- [ ] **1.3** Implement `setPortForAllEnvFiles()` wrapper method
  - [ ] Add method signature (backward compatible)
  - [ ] Call `setEnvVarAcrossFiles()` with PORT variable
  - [ ] Add JSDoc documentation

- [ ] **1.4** Update `HatchboxManager.setupEnvironment()` method
  - [ ] Replace single file copy with `copyAllEnvFiles()`
  - [ ] Replace `setPortForWorkspace()` with `setPortForAllEnvFiles()`
  - [ ] Update logging statements
  - [ ] Add NODE_ENV handling (default to 'development')

### Phase 2: Unit Tests

- [ ] **2.1** Add `copyAllEnvFiles()` unit tests
  - [ ] Test copying all existing files
  - [ ] Test handling missing files
  - [ ] Test nodeEnv option
  - [ ] Test empty directory case
  - [ ] Test skipLocalFiles option
  - [ ] Test overwrite option

- [ ] **2.2** Add `setEnvVarAcrossFiles()` unit tests
  - [ ] Test updating variable in highest priority file where it exists
  - [ ] Test updating variable when it exists in multiple files
  - [ ] Test adding new variable to highest priority file
  - [ ] Test adding new variable when only .env exists
  - [ ] Test targetFile override option
  - [ ] Test error when no files exist

- [ ] **2.3** Add `setPortForAllEnvFiles()` unit tests (backward compatibility)
  - [ ] Test PORT calculation and delegation to setEnvVarAcrossFiles
  - [ ] Test passing options through to setEnvVarAcrossFiles

- [ ] **2.4** Update existing tests
  - [ ] Update mock factories to include new methods (setEnvVarAcrossFiles, copyAllEnvFiles)
  - [ ] Update HatchboxManager tests to verify new method calls
  - [ ] Verify backward compatibility tests still pass

### Phase 3: Integration Tests

- [ ] **3.1** Add integration tests for multiple env files
  - [ ] Test complete workflow with multiple files and variable updates
  - [ ] Test all four scenarios (update existing, add new, multiple files, etc.)
  - [ ] Test environment file priority
  - [ ] Test bash script parity
  - [ ] Test PORT override behavior
  - [ ] Test with real filesystem

- [ ] **3.2** Add edge case tests
  - [ ] Test with no env files
  - [ ] Test with only .local files
  - [ ] Test with mixed file existence
  - [ ] Test with symbolic links
  - [ ] Test with permission issues

### Phase 4: Documentation

- [ ] **4.1** Update JSDoc comments
  - [ ] Add comprehensive documentation to new methods
  - [ ] Add examples to method documentation
  - [ ] Document parameters and return values

- [ ] **4.2** Update project documentation
  - [ ] Update technical-architecture.md
  - [ ] Update README.md if needed
  - [ ] Add this plan to docs/ directory

### Phase 5: Testing & Verification

- [ ] **5.1** Run test suite
  - [ ] Run all unit tests: `pnpm test`
  - [ ] Run integration tests
  - [ ] Verify >70% coverage maintained
  - [ ] Run property-based tests if affected

- [ ] **5.2** Manual testing
  - [ ] Test creating worktree with only .env
  - [ ] Test creating worktree with multiple env files
  - [ ] Test creating worktree with no env files
  - [ ] Test creating worktree in production mode
  - [ ] Verify PORT is set correctly in each case
  - [ ] Verify dotenv-flow loads variables correctly

- [ ] **5.3** Regression testing
  - [ ] Verify existing worktree creation still works
  - [ ] Verify bash script behavior is maintained
  - [ ] Verify no breaking changes to API

## 6. Specific Files and Line Numbers

### Files to Modify:

1. **`/Users/adam/Documents/Projects/hatchbox-ai/main/src/lib/EnvironmentManager.ts`**
   - Add `copyAllEnvFiles()` method after line 142 (after `copyEnvFile()`)
   - Add `setEnvVarAcrossFiles()` method after line 181 (after `setPortForWorkspace()`)
   - Add `setPortForAllEnvFiles()` wrapper method (backward compatibility)
   - Estimated additions: ~150 lines

2. **`/Users/adam/Documents/Projects/hatchbox-ai/main/src/lib/HatchboxManager.ts`**
   - Modify `setupEnvironment()` method (lines 353-374)
   - Replace lines 360-367 (single file copy) with new multi-file copy logic
   - Replace lines 369-373 (setPortForWorkspace) with new setPortForAllEnvFiles
   - Estimated changes: ~15 lines modified, ~10 lines added

3. **`/Users/adam/Documents/Projects/hatchbox-ai/main/src/lib/EnvironmentManager.test.ts`**
   - Add test suite after line 359 (end of file)
   - New test suites: `describe('copyAllEnvFiles')`, `describe('setEnvVarAcrossFiles')`, `describe('setPortForAllEnvFiles')`
   - Estimated additions: ~300-400 lines

4. **`/Users/adam/Documents/Projects/hatchbox-ai/main/src/lib/EnvironmentManager.integration.test.ts`**
   - Add test suite after line 272 (end of file)
   - New test suite: `describe('multiple environment files')`
   - Estimated additions: ~100-150 lines

5. **`/Users/adam/Documents/Projects/hatchbox-ai/main/src/lib/HatchboxManager.test.ts`**
   - Update mock factories (around lines 50-100)
   - Add new mock methods: `copyAllEnvFiles`, `setEnvVarAcrossFiles`, `setPortForAllEnvFiles`
   - Add test cases for new methods
   - Estimated changes: ~60 lines

6. **`/Users/adam/Documents/Projects/hatchbox-ai/main/docs/technical-architecture.md`**
   - Update EnvironmentManager section
   - Document new methods and behavior
   - Estimated additions: ~50 lines

### Files to Create:

1. **`/Users/adam/Documents/Projects/hatchbox-ai/main/docs/env-file-enhancement-plan.md`**
   - This document (already created)

## 7. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Breaking existing functionality** | LOW | Comprehensive tests, backward compatible API |
| **Secrets exposure** | LOW | Files already on dev machine, same security profile |
| **Performance degradation** | VERY LOW | Minimal file I/O increase (< 40ms) |
| **Test coverage drop** | LOW | Add comprehensive tests before implementation |
| **Confusion about which file PORT is in** | LOW | Clear documentation, predictable behavior (highest priority file) |
| **dotenv-flow behavior mismatch** | LOW | Use same package they already use, test priority |
| **Edge case file corruption** | LOW | Use existing battle-tested fs.copy() method |

**Overall Risk:** LOW - This is a well-scoped enhancement with clear requirements and minimal risk.

## 8. Success Criteria

### Functional Requirements:

- ✅ All applicable environment files are copied to worktrees (based on NODE_ENV)
- ✅ PORT is set uniquely in the highest-priority file
- ✅ Missing files are handled gracefully (no errors)
- ✅ File priority matches dotenv-flow / Next.js conventions
- ✅ Backward compatibility maintained (projects with only .env still work)
- ✅ Error handling is robust and user-friendly

### Non-Functional Requirements:

- ✅ Test coverage remains > 70%
- ✅ All unit tests pass
- ✅ All integration tests pass
- ✅ Performance impact < 50ms per worktree creation
- ✅ Documentation is comprehensive and accurate
- ✅ Code follows project conventions (TDD, DI, error handling)

### User Experience:

- ✅ Developers don't need to manually copy env files to worktrees
- ✅ Worktrees have same configuration as main repo
- ✅ Local overrides (.local files) are preserved
- ✅ PORT conflicts are prevented automatically
- ✅ Clear logging of what files were copied

## 9. Future Enhancements (Out of Scope)

These are potential improvements for future iterations:

1. **Environment-specific worktrees**: Allow creating production or test worktrees with different NODE_ENV
2. **Selective variable copying**: Copy only specific variables (exclude sensitive ones)
3. **Template system**: Support .env.example as template for missing files
4. **Encrypted secrets**: Integration with secret management systems
5. **Environment validation**: Ensure required variables are present in copied files
6. **Diff detection**: Only copy files that have changed since last worktree creation
7. **Merge strategy options**: Different strategies for handling conflicting variables
8. **Rollback support**: Backup and restore env files on worktree cleanup

## 10. Summary

This implementation plan provides a comprehensive roadmap for enhancing Hatchbox AI's environment file handling to support multiple environment file variants with intelligent variable management. The enhancement:

- **Is non-breaking** - Fully backward compatible
- **Follows standards** - Aligns with Next.js and dotenv-flow conventions
- **Is generalized** - Supports updating ANY environment variable, not just PORT
- **Is intelligent** - Updates variables in the right file based on where they exist
- **Is well-tested** - Comprehensive unit and integration tests with scenario coverage
- **Is well-documented** - Clear API docs with multiple examples
- **Is low-risk** - Minimal changes to critical paths
- **Adds value** - Developers get full environment parity and intelligent variable management

**Key Features:**

1. **Multi-file copying**: Copies all applicable environment files (`.env`, `.env.local`, `.env.[NODE_ENV]`, `.env.[NODE_ENV].local`)
2. **Intelligent variable updates**:
   - If variable exists: Update in highest-priority file where it's defined
   - If variable doesn't exist: Add to highest-priority file that exists
3. **Backward compatible**: Existing PORT setter still works as a convenience wrapper
4. **Flexible**: Supports any NODE_ENV and allows manual file targeting

**Estimated Implementation Time:**
- Core implementation: 5-7 hours (generalized approach is more complex)
- Testing: 5-7 hours (more test scenarios to cover)
- Documentation: 2-3 hours
- **Total: 12-17 hours**

**Recommended Approach:**
1. Start with `copyAllEnvFiles()` (simpler, builds foundation)
2. Implement `setEnvVarAcrossFiles()` with TDD (core logic)
3. Add `setPortForAllEnvFiles()` wrapper (quick win)
4. Update HatchboxManager integration
5. Add comprehensive unit tests for all scenarios
6. Add integration tests with real filesystem
7. Manual testing with real projects
8. Documentation update

**Scenario Coverage:**
This plan covers all four key scenarios:
1. Variable exists in one file → Update in that file
2. Variable exists in multiple files → Update in highest-priority file
3. Variable doesn't exist, multiple files available → Add to highest-priority
4. Variable doesn't exist, only .env available → Add to .env

This plan is ready for implementation. All technical details, edge cases, scenarios, and testing strategies have been thoroughly analyzed and documented.
