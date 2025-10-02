# Bash Script Enhancements Analysis
**Date:** October 2, 2025
**Source:** `/Users/adam/bin/hatchbox-bash`
**Context:** Enhancements made to bash workflow scripts over the last 3 weeks

---

## 📋 Overview

This document catalogs all enhancements and new functionality added to the bash workflow scripts since the original `plan.md` was created. These scripts manage Git worktrees, GitHub integration, database branching, and Claude AI workflows.

---

## 🆕 New Files (Not in Original Plan)

### 1. **`issue-start.sh`**
**Purpose:** Convenience wrapper for starting work with dual windows

**Functionality:**
- Validates issue/PR number is provided
- Launches `new-branch-workflow.sh` with `--complete` flag
- Opens TWO windows: Claude terminal + dev server

**Usage:**
```bash
./issue-start.sh 30          # Opens both Claude and dev server for issue #30
./issue-start.sh #30 -t      # Can pass additional options
```

---

### 2. **`prompts/` Directory**
**Purpose:** Structured, reusable Claude AI prompts

**Files:**
- **`issue-prompt.txt`** - Instructions for working on GitHub issues
  - Reads issue with full JSON output
  - Includes Context7 usage guidance
  - Dev server management instructions

- **`pr-prompt.txt`** - Instructions for working on Pull Requests
  - Reads PR with commits and files
  - Checks for related issue numbers
  - Waits for user guidance on next steps

- **`regular-prompt.txt`** - Generic instructions for regular branches
  - Context7 integration
  - Best practices reminders

**Benefits:**
- Centralized prompt management
- Consistent Claude behavior across workflows
- Easy to update and maintain

---

### 3. **`utils/log-utils.sh`**
**Purpose:** Centralized logging functions

**Functions:**
- `log()` - Base logging (always uses stderr)
- `log_info()` - Blue informational messages
- `log_success()` - Green success messages
- `log_warn()` - Yellow warning messages
- `log_error()` - Red error messages
- `log_debug()` - Debug output

**Key Feature:**
- **All output to stderr** - Keeps stdout clean for data return values
- Enables proper function return values (e.g., connection strings)

---

### 4. **`utils/vscode-color-sync.sh`**
**Purpose:** Synchronize VSCode title bar with terminal background

**Functions:**
- `get_vscode_color(branch_name)` - Generate hex color from branch hash
- `set_vscode_background(branch_name, workspace_path)` - Apply color to VSCode
- `reset_vscode_background(workspace_path)` - Restore default

**Features:**
- SHA256 hash-based color generation
- Same 10-color palette as terminal
- Updates `.vscode/settings.json` with `workbench.colorCustomizations`
- jq integration for safe JSON manipulation

**Usage:**
```bash
./vscode-color-sync.sh set feat/issue-123 /path/to/workspace
./vscode-color-sync.sh get-color feat/issue-123
./vscode-color-sync.sh reset /path/to/workspace
```

---

## 🔧 Enhanced Functionality in Existing Scripts

---

## `new-branch-workflow.sh`

### 1. **Terminal Background Coloring**
**Lines:** 106-128, 232-238

**Implementation:**
- `get_terminal_color(branch_name)` function
- 10 predefined subtle RGB colors
- SHA256 hash determines color selection
- Applied via AppleScript `set background color`

**Color Palette:**
- Soft blue, pink, green, cream, lavender, cyan, grey, ice blue, rose, mint
- Designed for gentle contrast, easy on eyes

**Integration:**
- Automatically syncs with VSCode title bar via `vscode-color-sync.sh`
- Provides visual workspace distinction

---

### 2. **GitHub Projects Integration**
**Lines:** 373-463

**New Function:** `move_issue_to_in_progress(issue_number)`

**Workflow:**
1. Checks for `project` scope in GitHub CLI auth
2. Gets repository owner and name
3. Lists all projects for the repository
4. Searches each project for the issue
5. Finds the "Status" field and "In Progress" option
6. Updates issue status via `gh project item-edit`

**Triggers:**
- When creating new worktree for issue
- When reopening existing worktree for issue

**Error Handling:**
- Graceful degradation if projects not found
- Clear warning messages for missing permissions
- Handles both "In Progress" and "In progress" naming variations

---

### 3. **Multiple Terminal/Code Opening Modes**
**Lines:** 44-68

**New Flags:**
- `-t, --terminal-only` - Opens terminal with PORT exported (no Claude)
- `-d, --dev-server` - Opens VS Code + terminal, starts `pnpm dev`
- `-c, --code-only` - Opens VS Code only (no terminal)
- `--complete` - Opens TWO windows: Claude terminal + dev server

**Mode Behaviors:**

| Mode | Terminal | Claude | VS Code | Dev Server |
|------|----------|--------|---------|------------|
| Default | ✓ | ✓ | - | - |
| `-t` | ✓ | - | - | - |
| `-d` | ✓ | - | ✓ | ✓ |
| `-c` | - | - | ✓ | - |
| `--complete` | ✓✓ | ✓ | ✓ | ✓ |

---

### 4. **Structured Claude Prompts**
**Lines:** 236, 264, 294, 322

**Implementation:**
- References external prompt files from `scripts/workflow/prompts/`
- Different prompts for issues vs PRs vs regular branches

**Issue Prompt:**
```bash
claude --add-dir '$absolute_path' --model opusplan --permission-mode plan \
  'Read and follow instructions in scripts/workflow/prompts/issue-prompt.txt, \
   substituting ISSUE_NUMBER with $ISSUE_NUMBER'
```

**PR Prompt:**
```bash
claude --add-dir '$absolute_path' \
  'Read and follow instructions in scripts/workflow/prompts/pr-prompt.txt, \
   substituting PR_NUMBER with $PR_NUMBER'
```

**Benefits:**
- Model selection per workflow type (opusplan for issues)
- Permission mode configuration
- Centralized prompt maintenance

---

### 5. **Interactive Input Prompting**
**Lines:** 84-93

**Enhancement:**
- If no issue/PR number provided, prompts user interactively
- Validates input before proceeding
- Better UX than immediate error exit

**Example:**
```bash
$ ./new-branch-workflow.sh
No issue or PR number provided. Please enter:
Issue or PR#: 30
```

---

### 6. **Existing Worktree Detection & Reuse**
**Lines:** 130-165, 167-215

**New Functions:**
- `find_existing_worktree(number, type)` - Locates existing worktree by issue/PR
- `handle_existing_worktree()` - Skips setup, opens terminal/code directly

**Detection Patterns:**
- **Issues:** `*issue-{N}` or `*issue-{N}-*`
- **PRs:** `*_pr_{N}` or `*issue-*_pr_{N}`

**Workflow:**
1. Check for existing worktree before creating
2. Extract branch name from worktree list
3. Reuse all existing setup (dependencies, database, etc.)
4. Move issue to "In Progress" if reopening
5. Skip directly to opening terminal or VS Code

**Benefits:**
- Faster workflow for returning to issues
- Preserves all existing state
- Avoids duplicate worktrees

---

### 7. **Workflow Scripts Symlinking**
**Lines:** 727-738

**Implementation:**
- Creates `${WORKTREE_PATH}/scripts/workflow` symlink
- Points to `${REPO_ROOT}/scripts/workflow`
- Only if main worktree has workflow scripts

**Benefits:**
- Scripts accessible from any worktree
- Single source of truth for workflow automation
- Enables `merge-current-issue.sh` to work from worktrees

---

### 8. **Complete Mode with Dual Windows**
**Lines:** 796-824

**Implementation:**
1. Opens first window with Claude and issue/PR context
2. Waits 3 seconds for initialization
3. Temporarily sets `DEV_SERVER=true`
4. Opens second window with VS Code + dev server
5. Restores original flag values

**Use Case:**
- Full development environment setup with one command
- Claude for implementation + live dev server for testing
- Used by `issue-start.sh` wrapper

---

## `merge-and-clean.sh`

### 1. **Pull Request Workflow**
**Lines:** 56-76, 269-386

**New Flag:** `--pr <number>`

**Workflow Decision Tree:**

```
PR State Detection
├─ CLOSED/MERGED
│  └─ Skip merge, perform cleanup only
│     ├─ Run cleanup-worktree.sh
│     ├─ Remove database branch
│     └─ Exit
│
└─ OPEN
   ├─ Navigate to worktree
   ├─ Check for uncommitted changes
   │  └─ Auto-commit with generated message
   ├─ Push changes to remote
   └─ Keep worktree active
```

**Key Difference:**
- Issues: Merge to main and cleanup
- Open PRs: Push to remote and keep active
- Closed PRs: Cleanup only

**Usage:**
```bash
./merge-and-clean.sh --pr 148
```

---

### 2. **Claude-Assisted Auto-Commit**
**Lines:** 146-191

**New Function:** `generate_and_commit(issue_number?)`

**Workflow:**
1. Check for staged changes
2. Generate commit message via Claude with prompt:
   - "Examine uncommitted changes"
   - "Generate concise commit message"
   - "Use imperative mood"
   - "Include 'Fixes #N' if resolving issue"
3. Open editor for user review/editing with `git commit -e`
4. Fallback to manual commit if Claude fails

**Error Handling:**
- Detects API errors, "prompt too long" errors
- Validates generated message is not empty
- Graceful degradation to standard `git commit`

---

### 3. **Claude-Assisted Error Fixing**
**Lines:** 479-563

**Implementation:** Pre-merge validation pipeline with Claude recovery

**Pipeline:**

1. **Typecheck** (`pnpm typecheck`)
   - If fails: Launch Claude to analyze and fix type errors
   - Re-run typecheck to verify
   - Exit if still failing

2. **Lint** (`pnpm lint`)
   - If fails: Launch Claude to fix linting issues
   - Re-run lint to verify
   - Exit if still failing

3. **Tests** (`pnpm vitest run`)
   - If fails: Show failure summary (grep for FAIL/AssertionError)
   - Launch Claude to analyze and fix test failures
   - Re-run tests to verify
   - Exit if still failing

**Claude Prompts:**
- Clear, specific instructions for each error type
- Includes command to view errors
- Emphasizes fixing actual issues, not just tests

**Benefits:**
- Automated error resolution
- Maintains code quality gates
- Reduces manual debugging time

---

### 4. **Claude-Assisted Conflict Resolution**
**Lines:** 839-902

**Enhancement:** Automated git rebase conflict resolution

**Workflow:**
1. Detect rebase conflicts (check for `U` status files)
2. List conflicted files
3. Launch Claude with comprehensive prompt:
   - "Analyze conflicted files"
   - "Understand changes from both branches"
   - "Fix conflicts"
   - "Stage resolved files: git add ."
   - "Continue rebase: git rebase --continue"
4. Validate Claude's success:
   - Check for remaining conflicts
   - Check if still in rebase state
5. Ask user to review changes before continuing merge

**Safety Mechanisms:**
- Validates resolution before proceeding
- Offers manual resolution instructions if Claude fails
- User confirmation before continuing with merge

---

### 5. **Enhanced Post-Merge Migration Handling**
**Lines:** 1006-1083

**New Function:** `handle_post_merge_migrations()`

**Critical Safety Enhancement:**
```
Old Behavior: Generate → Commit → Hope
New Behavior: Generate → Execute → Validate → Commit
```

**Workflow:**
1. Run `pnpm payload migrate:create --skip-empty`
2. Check if new migration files created
3. **Ask user permission** to run and commit
4. **Run migrations first:** `pnpm payload migrate`
5. Validate execution succeeded
6. **Only commit if migrations executed successfully**
7. If execution fails: Show error, skip commit, provide manual instructions

**Benefits:**
- Prevents committing broken migrations
- Ensures database schema validity
- Clear error feedback for debugging

---

### 6. **Smart Dev Server Detection & Termination**
**Lines:** 1092-1148

**Enhancements:**

1. **LISTEN State Only**
   - Uses `grep LISTEN` to filter port output
   - Avoids false positives from client connections

2. **Enhanced Process Detection**
   - Checks process name: `node`, `npm`, `pnpm`, `yarn`, `next`, `vite`, `webpack`
   - Checks full command line for: `next dev`, `npm.*dev`, `pnpm.*dev`, `vite`, etc.
   - Dual-layer validation

3. **Force Kill**
   - Uses `kill -9` for stubborn processes
   - Waits 1 second for process death
   - Verifies termination with `lsof` check

4. **Safety Prompt**
   - If process doesn't match patterns, asks user
   - Prevents killing unrelated processes

**Example Detection:**
```bash
PID: 12345
Name: node
Command: /usr/local/bin/node /path/to/.bin/next dev
Result: ✅ Confirmed dev server, force killing
```

---

## `cleanup-worktree.sh`

### 1. **Auto-Detection of Numeric Input**
**Lines:** 363-369

**Enhancement:**
```bash
# Old behavior - requires explicit --issue flag
./cleanup-worktree.sh --issue 25

# New behavior - auto-detects
./cleanup-worktree.sh 25  # Automatically treated as issue number
```

**Logic:**
- If argument matches `^[0-9]+$`, treat as issue number
- Sets `ISSUE=true` and `ISSUE_NUMBER` automatically

---

### 2. **Enhanced Multi-Pattern Issue Branch Finding**
**Lines:** 133-154

**New Function:** `find_issue_branches(issue_number)`

**Detection Patterns:**
- `issue-25` - Standard pattern
- `25-feature` - Number prefix
- `feat-25` - Number suffix
- `feat/issue-25` - With namespace
- Any pattern with issue number surrounded by non-digits

**Filters:**
- Excludes `main`, `master`, `develop`
- Removes `origin/` prefix
- Cleans git status markers (`+`, `*`, etc.)

**Search Scope:**
- Local branches: `git branch`
- Remote branches: `git branch -a`

**Benefits:**
- More flexible branch naming conventions
- Catches branches from forks
- Thorough cleanup

---

## `utils/neon-utils.sh`

### 1. **Structured Logging Integration**
**Lines:** 6-9

**Change:**
```bash
# Old
echo "Creating database branch..."

# New
log_info "🗂️  Creating database branch..."
log_success "✅ Database branch created"
```

**Benefits:**
- Consistent formatting across all scripts
- Color-coded by severity
- Keeps stdout clean for return values

---

### 2. **Vercel Preview Database Detection**
**Lines:** 93-124

**New Function:** `find_preview_database_branch(pr_branch)`

**Detection Logic:**
1. Check for `preview/$pr_branch` (Vercel naming convention)
2. Check for `preview_$(sanitize $pr_branch)` (underscore variant)
3. Return branch name if found

**Integration:**
- Used by `create_neon_database_branch()` to prefer preview databases
- Used by `delete_neon_database_branch()` to protect preview databases

**Vercel Pattern:**
```
PR Branch: feat/new-ui
Preview DB: preview/feat/new-ui  ← Automatically detected
```

---

### 3. **Preview Database Priority in Creation**
**Lines:** 149-158

**Enhancement:**
```
ALWAYS check for Vercel preview database first
├─ If found: Return preview connection string
└─ If not found: Create new dedicated branch
```

**Benefits:**
- Leverages Vercel's automatic database branching
- Avoids duplicate database branches
- Uses preview data populated by Vercel
- Seamless integration with Vercel deployments

---

### 4. **Preview Database Protection in Deletion**
**Lines:** 226-245

**New Parameter:** `is_preview` boolean

**Workflow:**
1. If `is_preview=true`, check for Vercel preview database
2. If found, show warning:
   - "Found Vercel preview database"
   - "Managed by Vercel, cleaned up automatically"
   - "Manual deletion may interfere with deployments"
3. Ask explicit confirmation: `[y/N]`
4. Default to NOT deleting
5. Only delete if user explicitly confirms

**Safety:**
- Prevents accidental interference with Vercel
- Educates user about preview database lifecycle
- Default-safe behavior

---

### 5. **Reverse Endpoint Lookup**
**Lines:** 262-308

**New Function:** `get_neon_branch_name(endpoint_id)`

**Purpose:** Find branch name from connection string endpoint

**Algorithm:**
1. List all Neon branches
2. For each branch:
   - Get connection string
   - Extract endpoint ID via regex
   - Compare with target endpoint
3. Return branch name on match

**Use Cases:**
- Database URL validation
- Migration scripts
- Debugging connection issues
- Automated database management

**Example:**
```bash
# Input: ep-cool-shadow-123456
# Output: feat_issue-25_my-feature
```

---

## `utils/env-utils.sh`

### 1. **Structured Logging Integration**
**Lines:** 6-8

**Change:**
```bash
# Old
echo "Setting env var..."

# New
log_info "📝 Setting env var..."
log_success "✅ Variable set successfully"
```

---

## 📊 Summary Statistics

| Category | Count |
|----------|-------|
| **New Files** | 4 |
| **New Utility Functions** | 10+ |
| **Enhanced Scripts** | 4 |
| **Major Features Added** | 15+ |
| **Lines of New Code** | ~800+ |

---

## 🎯 Key Enhancement Themes

### 1. **Visual Consistency**
- Terminal background coloring
- VSCode title bar synchronization
- Color-coded logging

### 2. **GitHub Integration**
- Projects API integration
- Auto-status updates ("In Progress")
- Enhanced PR workflow support

### 3. **Claude Automation**
- Structured prompt files
- Auto-commit message generation
- Error fixing (typecheck, lint, tests)
- Conflict resolution

### 4. **Workflow Flexibility**
- Multiple opening modes (-t, -d, -c, --complete)
- Existing worktree reuse
- Dual-window development environment

### 5. **Safety & Validation**
- Preview database protection
- Migration validation before commit
- Enhanced dev server detection
- Conflict resolution validation

### 6. **Developer Experience**
- Interactive prompts
- Structured logging
- Better error messages
- Graceful degradation

---

## 🔄 Backward Compatibility

**All enhancements maintain backward compatibility:**
- Original command syntax still works
- New flags are optional
- Graceful fallbacks for missing tools
- Silent feature degradation (e.g., no Neon CLI)

---

## 📝 Implementation Notes

### Testing Considerations
All enhanced functionality should be tested in TypeScript implementation:

1. **Mock Requirements:**
   - GitHub Projects API responses
   - Claude CLI outputs
   - Neon CLI branch listings
   - Git rebase conflict states
   - VSCode settings.json manipulation

2. **Edge Cases:**
   - Missing GitHub project permissions
   - Claude API failures
   - Vercel preview database race conditions
   - Concurrent worktree creation
   - Migration execution failures

3. **Integration Tests:**
   - End-to-end PR workflow
   - Complete mode dual-window setup
   - Error recovery workflows
   - Existing worktree detection

### Migration Priority

**High Priority:**
- Claude-assisted error fixing (critical for workflow)
- PR workflow support (significant new capability)
- Existing worktree detection (major UX improvement)

**Medium Priority:**
- Terminal/VSCode coloring (nice UX, lower impact)
- GitHub Projects integration (useful but not critical)
- Structured prompts (important for consistency)

**Low Priority:**
- Log utility standardization (refactoring)
- Reverse endpoint lookup (rare use case)

---

## 🚀 Future Considerations

These enhancements suggest future TypeScript features:

1. **Plugin System for Prompts**
   - User-customizable prompt templates
   - Project-specific Claude instructions

2. **Visual Customization**
   - User-defined color palettes
   - Theme integration

3. **Enhanced GitHub Integration**
   - Multiple project support
   - Custom field mappings
   - Automated PR creation

4. **AI-Assisted Development**
   - Pre-commit validation with Claude
   - Automated test generation
   - Code review suggestions

---

**Document Version:** 1.0
**Last Updated:** October 2, 2025
**Author:** Analysis of bash scripts in `/Users/adam/bin/hatchbox-bash`
