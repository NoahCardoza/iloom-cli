import { executeGitCommand } from '../utils/git.js'
import { getLogger } from '../utils/logger-context.js'
import { launchClaude, detectClaudeCli } from '../utils/claude.js'
import { promptCommitAction } from '../utils/prompt.js'
import { isRunningInVSCode, isVSCodeAvailable } from '../utils/vscode.js'
import { UserAbortedCommitError } from '../types/index.js'
import type { GitStatus, CommitOptions } from '../types/index.js'
import { writeFile, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { execa } from 'execa'

/**
 * CommitManager handles uncommitted changes detection and auto-commit
 * Ports logic from bash/merge-and-clean.sh lines 610-643
 */
export class CommitManager {
  constructor() {
    // Uses getLogger() for all logging operations
  }

  /**
   * Detect uncommitted changes in a worktree
   * Parses git status --porcelain output into structured GitStatus
   */
  async detectUncommittedChanges(worktreePath: string): Promise<GitStatus> {
    // Execute: git status --porcelain
    const porcelainOutput = await executeGitCommand(['status', '--porcelain'], {
      cwd: worktreePath,
    })

    // Parse output to get staged and unstaged files
    const { stagedFiles, unstagedFiles } = this.parseGitStatus(porcelainOutput)

    // Get current branch name
    const currentBranch = await executeGitCommand(['branch', '--show-current'], {
      cwd: worktreePath,
    })

    return {
      hasUncommittedChanges: stagedFiles.length > 0 || unstagedFiles.length > 0,
      unstagedFiles,
      stagedFiles,
      currentBranch: currentBranch.trim(),
      // Defer these to future enhancement
      isAheadOfRemote: false,
      isBehindRemote: false,
    }
  }


  /**
   * Stage all changes and commit with Claude-generated or simple message
   * Tries Claude first, falls back to simple message if Claude unavailable or fails
   */
  async commitChanges(worktreePath: string, options: CommitOptions): Promise<void> {
    // Step 1: Check dry-run mode
    if (options.dryRun) {
      getLogger().info('[DRY RUN] Would run: git add -A')
      getLogger().info('[DRY RUN] Would generate commit message with Claude (if available)')
      const fallbackMessage = this.generateFallbackMessage(options)
      const verifyFlag = options.skipVerify ? ' --no-verify' : ''
      getLogger().info(`[DRY RUN] Would commit with message${verifyFlag}: ${fallbackMessage}`)
      return
    }

    // Step 2: Stage all changes
    await executeGitCommand(['add', '-A'], { cwd: worktreePath })

    // Step 3: Generate commit message (try Claude first, fallback to simple)
    let message: string | null = null

    // Skip Claude if custom message provided
    if (!options.message) {
      try {
        message = await this.generateClaudeCommitMessage(worktreePath, options.issueNumber)
      } catch (error) {
        getLogger().debug('Claude commit message generation failed, using fallback', { error })
      }
    }

    // Fallback to simple message if Claude failed or unavailable
    message ??= this.generateFallbackMessage(options)

    // Step 4: Log warning if --no-verify is configured
    if (options.skipVerify) {
      getLogger().warn('Skipping pre-commit hooks (--no-verify configured in settings)')
    }

    // Step 5: Commit with user review via prompt (unless noReview specified)
    try {
      if (options.noReview || options.message) {
        // Direct commit without review (custom message or noReview flag)
        const commitArgs = ['commit', '-m', message]
        if (options.skipVerify) {
          commitArgs.push('--no-verify')
        }
        await executeGitCommand(commitArgs, { cwd: worktreePath })
      } else {
        // Prompt user for action instead of going straight to editor
        const action = await promptCommitAction(message)

        if (action === 'abort') {
          throw new UserAbortedCommitError()
        }

        if (action === 'accept') {
          // Direct commit with -m flag (no editor)
          const commitArgs = ['commit', '-m', message]
          if (options.skipVerify) {
            commitArgs.push('--no-verify')
          }
          await executeGitCommand(commitArgs, { cwd: worktreePath })
        } else {
          // action === 'edit': Use git editor for user review
          getLogger().info('Opening editor for commit message review...')

          // Use VSCode-specific flow when running in VSCode terminal
          // This opens the file in the current VSCode window instead of a random one
          if (isRunningInVSCode() && await isVSCodeAvailable()) {
            await this.commitWithVSCodeEditor(worktreePath, message, options)
          } else {
            // Standard git editor flow for non-VSCode environments
            const commitArgs = ['commit', '-e', '-m', message]
            if (options.skipVerify) {
              commitArgs.push('--no-verify')
            }
            await executeGitCommand(commitArgs, {
              cwd: worktreePath,
              stdio: 'inherit',
              timeout: 300000 // 5 minutes for interactive editing
            })
          }
        }
      }
    } catch (error) {
      // Re-throw UserAbortedCommitError as-is
      if (error instanceof UserAbortedCommitError) {
        throw error
      }
      // Handle "nothing to commit" scenario gracefully
      if (error instanceof Error && error.message.includes('nothing to commit')) {
        getLogger().info('No changes to commit')
        return
      }
      // Re-throw all other errors (including pre-commit hook failures)
      throw error
    }
  }


  /**
   * Commit with VSCode editor - handles file creation, editing, and commit ourselves
   * to ensure the file opens in the current VSCode window (preserves IPC context)
   */
  private async commitWithVSCodeEditor(
    worktreePath: string,
    message: string,
    options: CommitOptions
  ): Promise<void> {
    // Put the commit message file in the worktree root so VSCode opens it in the correct
    // window (files within a workspace folder open in that workspace's window)
    const commitMsgPath = join(worktreePath, '.COMMIT_EDITMSG')

    // Write the initial commit message (with git-style comments)
    const initialContent = `${message}

# Please enter the commit message for your changes. Lines starting
# with '#' will be ignored, and an empty message aborts the commit.
#
# Save and close the file to complete the commit.
`
    await writeFile(commitMsgPath, initialContent, 'utf-8')

    try {
      getLogger().debug(`Opening commit message in VSCode: ${commitMsgPath}`)

      // Open the file - since it's in the worktree root, VSCode will open it
      // in the window that has this folder open
      await execa('code', ['--wait', commitMsgPath], {
        cwd: worktreePath,
        stdio: 'inherit'
      })

      // Read the edited message
      const editedContent = await readFile(commitMsgPath, 'utf-8')

      // Strip comment lines and trim
      const finalMessage = editedContent
        .split('\n')
        .filter(line => !line.startsWith('#'))
        .join('\n')
        .trim()

      // Check for empty message (user aborted)
      if (!finalMessage) {
        throw new UserAbortedCommitError()
      }

      // Commit with the edited message
      const commitArgs = ['commit', '-F', commitMsgPath]
      if (options.skipVerify) {
        commitArgs.push('--no-verify')
      }

      // Rewrite the file without comments for git commit -F
      await writeFile(commitMsgPath, finalMessage, 'utf-8')
      await executeGitCommand(commitArgs, { cwd: worktreePath })

    } finally {
      // Clean up - git normally handles this but we should be safe
      try {
        await unlink(commitMsgPath)
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Generate simple fallback commit message when Claude unavailable
   * Used as fallback for Claude-powered commit messages
   */
  private generateFallbackMessage(options: CommitOptions): string {
    // If custom message provided, use it
    if (options.message) {
      return options.message
    }

    // Generate WIP message
    if (options.issueNumber) {
      return `WIP: Auto-commit for issue #${options.issueNumber}\n\nFixes #${options.issueNumber}`
    } else {
      return 'WIP: Auto-commit uncommitted changes'
    }
  }

  /**
   * Parse git status --porcelain output
   * Format: "XY filename" where X=index, Y=worktree
   * Examples:
   *   "M  file.ts" - staged modification
   *   " M file.ts" - unstaged modification
   *   "MM file.ts" - both staged and unstaged
   *   "?? file.ts" - untracked
   */
  private parseGitStatus(porcelainOutput: string): {
    stagedFiles: string[]
    unstagedFiles: string[]
  } {
    const stagedFiles: string[] = []
    const unstagedFiles: string[] = []

    if (!porcelainOutput.trim()) {
      return { stagedFiles, unstagedFiles }
    }

    const lines = porcelainOutput.split('\n').filter((line) => line.trim())

    for (const line of lines) {
      if (line.length < 3) continue

      const indexStatus = line[0] // First character - staging area status
      const worktreeStatus = line[1] // Second character - working tree status
      const filename = line.substring(3) // Everything after "XY "

      // Check if file is staged
      // First char != ' ' and != '?' → staged
      if (indexStatus !== ' ' && indexStatus !== '?') {
        stagedFiles.push(filename)
      }

      // Check if file is unstaged
      // Second char != ' ' or line starts with '??' → unstaged
      if (worktreeStatus !== ' ' || line.startsWith('??')) {
        unstagedFiles.push(filename)
      }
    }

    return { stagedFiles, unstagedFiles }
  }

  /**
   * Generate commit message using Claude Code
   * Claude examines the git repository directly via --add-dir option
   * Returns null if Claude unavailable or fails validation
   */
  private async generateClaudeCommitMessage(
    worktreePath: string,
    issueNumber?: string | number
  ): Promise<string | null> {
    const startTime = Date.now()

    getLogger().info('Starting Claude commit message generation...', {
      worktreePath: worktreePath.split('/').pop(), // Just show the folder name for privacy
      issueNumber
    })

    // Check if Claude CLI is available
    getLogger().debug('Checking Claude CLI availability...')
    const isClaudeAvailable = await detectClaudeCli()
    if (!isClaudeAvailable) {
      getLogger().info('Claude CLI not available, skipping Claude commit message generation')
      return null
    }
    getLogger().debug('Claude CLI is available')

    // Build XML-based structured prompt
    getLogger().debug('Building commit message prompt...')
    const prompt = this.buildCommitMessagePrompt(issueNumber)
    getLogger().debug('Prompt built', { promptLength: prompt.length })

    // Debug log the actual prompt content for troubleshooting
    getLogger().debug('Claude prompt content:', {
      prompt: prompt,
      truncatedPreview: prompt.substring(0, 500) + (prompt.length > 500 ? '...[truncated]' : '')
    })

    try {
      getLogger().info('Calling Claude CLI for commit message generation...')
      const claudeStartTime = Date.now()

      // Debug log the Claude call parameters
      const claudeOptions = {
        headless: true,
        addDir: worktreePath,
        model: 'claude-haiku-4-5-20251001', // Fast, cost-effective model
        timeout: 120000, // 120 second timeout
      }
      getLogger().debug('Claude CLI call parameters:', {
        options: claudeOptions,
        worktreePathForAnalysis: worktreePath,
        addDirContents: 'Will include entire worktree directory for analysis'
      })

      // Launch Claude in headless mode with repository access and shorter timeout for commit messages
      const result = await launchClaude(prompt, claudeOptions)

      const claudeDuration = Date.now() - claudeStartTime
      getLogger().debug('Claude API call completed', { duration: `${claudeDuration}ms` })

      if (typeof result !== 'string') {
        getLogger().warn('Claude returned non-string result', { resultType: typeof result })
        return null
      }

      getLogger().debug('Raw Claude output received', {
        outputLength: result.length,
        preview: result.substring(0, 200) + (result.length > 200 ? '...' : '')
      })


      // Sanitize output - remove meta-commentary and clean formatting
      getLogger().debug('Sanitizing Claude output...')
      const sanitized = this.sanitizeClaudeOutput(result)
      getLogger().debug('Output sanitized', {
        originalLength: result.length,
        sanitizedLength: sanitized.length,
        sanitized: sanitized.substring(0, 200) + (sanitized.length > 200 ? '...' : '')
      })

      // Ensure empty strings are rejected
      if (!sanitized) {
        getLogger().warn('Claude returned empty message after sanitization')
        return null
      }

      // Append "Fixes #N" trailer if issue number provided
      let finalMessage = sanitized
      if (issueNumber) {
        // Add Fixes trailer if not already present
        if (!finalMessage.includes(`Fixes #${issueNumber}`)) {
          finalMessage = `${finalMessage}\n\nFixes #${issueNumber}`
          getLogger().debug(`Added "Fixes #${issueNumber}" trailer to commit message`)
        } else {
          getLogger().debug(`"Fixes #${issueNumber}" already present in commit message`)
        }
      }

      const totalDuration = Date.now() - startTime
      getLogger().info('Claude commit message generated successfully', {
        message: finalMessage,
        totalDuration: `${totalDuration}ms`,
        claudeApiDuration: `${claudeDuration}ms`
      })

      return finalMessage
    } catch (error) {
      const totalDuration = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      if (errorMessage.includes('timed out') || errorMessage.includes('timeout')) {
        getLogger().warn('Claude commit message generation timed out after 45 seconds', {
          totalDuration: `${totalDuration}ms`,
          worktreePath: worktreePath.split('/').pop()
        })
      } else {
        getLogger().warn('Failed to generate commit message with Claude', {
          error: errorMessage,
          totalDuration: `${totalDuration}ms`,
          worktreePath: worktreePath.split('/').pop()
        })
      }
      return null
    }
  }

  /**
   * Build structured XML prompt for commit message generation
   * Uses XML format for clear task definition and output expectations
   */
  private buildCommitMessagePrompt(issueNumber?: string | number): string {
    const issueContext = issueNumber
      ? `\n<IssueContext>
This commit is associated with GitHub issue #${issueNumber}.
If the changes appear to resolve the issue, include "Fixes #${issueNumber}" at the end of the first line of commit message.
</IssueContext>`
      : ''

    return `<Task>
You are a software engineer writing a commit message for this repository.
Examine the staged changes in the git repository and generate a concise, meaningful commit message.
</Task>

<Requirements>
<Format>The first line must be a brief summary of the changes made as a full sentence. If it references an issue, include "Fixes #N" at the end of this line.

Add 2 newlines, then add a bullet-point form description of the changes made, each change on a new line.</Format>
<Mood>Use imperative mood (e.g., "Add feature" not "Added feature")</Mood>
<Focus>Be specific about what was changed and why</Focus>
<Conciseness>Keep message under 72 characters for subject line when possible</Conciseness>
<NoMeta>CRITICAL: Do NOT include ANY explanatory text, analysis, or meta-commentary. Output ONLY the raw commit message.</NoMeta>
<Examples>
Good: "Add user authentication with JWT tokens. Fixes #42

- Implement login and registration endpoints
- Secure routes with JWT middleware
- Update user model to store hashed passwords"
Good: "Fix navigation bug in sidebar menu."
Bad: "Based on the changes, I'll create: Add user authentication"
Bad: "Looking at the files, this commit should be: Fix navigation bug"
</Examples>
${issueContext}
</Requirements>

<Output>
IMPORTANT: Your entire response will be used directly as the git commit message.
Do not include any explanatory text before or after the commit message.
Start your response immediately with the commit message text.
</Output>`
  }

  /**
   * Sanitize Claude output to remove meta-commentary and clean formatting
   * Handles cases where Claude includes explanatory text despite instructions
   */
  private sanitizeClaudeOutput(rawOutput: string): string {
    let cleaned = rawOutput.trim()

    // Remove common meta-commentary patterns (case-insensitive)
    const metaPatterns = [
      /^.*?based on.*?changes.*?:/i,
      /^.*?looking at.*?files.*?:/i,
      /^.*?examining.*?:/i,
      /^.*?analyzing.*?:/i,
      /^.*?i'll.*?generate.*?:/i,
      /^.*?let me.*?:/i,
      /^.*?the commit message.*?should be.*?:/i,
      /^.*?here.*?is.*?commit.*?message.*?:/i,
    ]

    for (const pattern of metaPatterns) {
      cleaned = cleaned.replace(pattern, '').trim()
    }

    // Extract content after separators only if it looks like meta-commentary
    // Only split on colons if there's clear meta-commentary before it
    if (cleaned.includes(':')) {
      const colonIndex = cleaned.indexOf(':')
      const beforeColon = cleaned.substring(0, colonIndex).trim().toLowerCase()

      // Only split if the text before colon looks like meta-commentary
      const metaIndicators = [
        'here is the commit message',
        'commit message',
        'here is',
        'the message should be',
        'i suggest',
        'my suggestion'
      ]

      const isMetaCommentary = metaIndicators.some(indicator => beforeColon.includes(indicator))

      if (isMetaCommentary) {
        const afterColon = cleaned.substring(colonIndex + 1).trim()
        if (afterColon && afterColon.length > 10) {
          cleaned = afterColon
        }
      }
    }

    // Remove quotes if the entire message is wrapped in them
    if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
        (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
      cleaned = cleaned.slice(1, -1).trim()
    }

    return cleaned
  }


}
