# FinishCommand Test Structure

## Main Test Suite: FinishCommand

### execute

#### input parsing - explicit identifier
- should parse plain issue number (123)
- should parse hash-prefixed issue number (#123)
- should parse PR-specific format (pr/123, PR-123, PR/123)
- should parse branch name as fallback
- should trim whitespace from input

#### PR flag handling
- should use --pr flag value when provided
- should prioritize --pr flag over identifier

#### GitHub API detection
- should detect issue vs PR for numeric input via GitHub API
- should throw error if number is neither issue nor PR

#### auto-detection from current directory
- should auto-detect PR number from _pr_N worktree directory pattern
- should auto-detect issue number from issue-N branch pattern
- should extract PR number from directory like "feat-issue-46_pr_123"
- should detect when running in PR worktree without identifier argument
- should fall back to branch name when no pattern matches
- should throw error when auto-detection fails completely

#### edge cases
- should handle very large issue numbers (999999)
- should handle leading zeros in numbers
- should reject invalid characters in branch names
- should handle single-character branch names
- should handle very long branch names (255+ chars)

#### validation

##### issue validation
- should validate open issue exists on GitHub
- should throw error for closed issue without --force
- should allow closed issue with --force flag
- should throw error if issue not found on GitHub
- should throw error if worktree not found for issue

##### PR validation
- should validate open PR exists on GitHub
- should allow closed PR (cleanup-only mode)
- should allow merged PR (cleanup-only mode)
- should throw error if PR not found on GitHub

##### branch validation
- should validate branch name format (valid characters)
- should throw error if branch not found

##### worktree auto-detection
- should warn if multiple worktrees match identifier
- should use first matching worktree if multiple found

#### options handling

##### force flag
- should accept --force flag
- should skip confirmations when force=true

##### dry-run flag
- should accept --dry-run flag
- should preview actions without executing when dryRun=true
- should prefix log messages with [DRY RUN]
- should perform GitHub API reads in dry-run mode

##### flag combinations
- should handle --force and --dry-run together
- should handle --pr with --force
- should handle --pr with --dry-run
- should handle all three flags together

#### error handling
- should handle GitHub API timeout gracefully
- should handle GitHub API rate limit errors
- should handle GitHub authentication errors
- should provide clear error message when API fails
- should handle Git command failures gracefully
- should throw error with helpful message for invalid input
- should include original input in error messages
- should handle thrown strings gracefully
- should handle thrown null/undefined gracefully

#### workflow execution order
- should execute complete workflow including merge steps
- should run validation BEFORE detecting and committing changes
- should NOT commit if validation fails
- should pass correct options to MergeManager
- should handle rebase conflicts and stop workflow

### dependency injection
- should accept GitHubService via constructor
- should accept GitWorktreeManager via constructor
- should accept ValidationRunner via constructor
- should accept CommitManager via constructor
- should accept MergeManager via constructor
- should create default instances when not provided

## Notes

- **Pattern-based Detection**: Tests should use `mockIdentifierParser.parseForPatternDetection` instead of `mockGitHubService.detectInputType` for numeric inputs
- **Specific Worktree Finding**: Tests should use `findWorktreeForIssue`, `findWorktreeForPR`, `findWorktreeForBranch` instead of `findWorktreesByIdentifier`
- **GitHub API**: Still used for validation (fetchIssue, fetchPR) but NOT for detection
- **PR Format Detection**: `pr/123` format should NOT call IdentifierParser, it's handled directly in FinishCommand
- **Auto-detection**: Uses different logic from explicit parsing (processes current directory)