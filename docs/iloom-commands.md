# iloom Command Reference

Complete documentation for all iloom CLI commands, options, and flags.

## Table of Contents

- [Core Workflow Commands](#core-workflow-commands)
  - [il start](#il-start)
  - [il finish](#il-finish)
  - [il rebase](#il-rebase)
  - [il cleanup](#il-cleanup)
  - [il list](#il-list)
- [Context & Development Commands](#context--development-commands)
  - [il spin](#il-spin)
  - [il open](#il-open)
- [Issue Management Commands](#issue-management-commands)
  - [il add-issue](#il-add-issue)
  - [il enhance](#il-enhance)
- [Configuration & Maintenance](#configuration--maintenance)
  - [il init / il config](#il-init--il-config)
  - [il update](#il-update)
  - [il feedback](#il-feedback)
  - [il contribute](#il-contribute)

---

## Core Workflow Commands

### il start

Create an isolated loom workspace with complete AI-assisted context establishment.

**Aliases:** `up`, `create`

**Usage:**
```bash
il start <issue-number>
il start <pr-number>
il start <branch-name>
il start "<issue-description>"
```

**Arguments:**
- `<issue-number>` - GitHub or Linear issue number (e.g., `25`)
- `<pr-number>` - GitHub pull request number (e.g., `42`)
- `<branch-name>` - Existing git branch name
- `<issue-description>` - Free-form description to create a new issue (quoted string)

**Options:**

| Flag | Values | Description |
|------|--------|-------------|
| `--one-shot` | `default`, `noReview`, `bypassPermissions` | Automation level for Claude CLI workflow |
| `--child-loom` | - | Force create as child loom (skip prompt, requires parent loom) |
| `--no-child-loom` | - | Force create as independent loom (skip prompt) |
| `--claude` / `--no-claude` | - | Enable/disable Claude integration (default: enabled) |
| `--code` / `--no-code` | - | Enable/disable VS Code launch (default: enabled) |
| `--dev-server` / `--no-dev-server` | - | Enable/disable dev server in terminal (default: enabled) |
| `--terminal` / `--no-terminal` | - | Enable/disable terminal without dev server (default: disabled) |
| `--body` | `<text>` | Body text for issue (skips AI enhancement) |

**One-Shot Modes:**
- `default` - Standard behavior with approval prompts at each phase
- `noReview` - Skip phase approval prompts, but respect permission settings
- `bypassPermissions` - Full automation, skip all permission and approval prompts (use with caution!)

**Workflow Phases:**

The `il start` command orchestrates multiple AI agents:

1. **Fetch** - Retrieves issue/PR details from GitHub or Linear
2. **Enhance** (conditional) - Expands brief issues into detailed requirements
3. **Evaluate** - Assesses complexity and determines workflow approach (Simple vs Complex)
4. **Analyze** (complex issues only) - Investigates root causes and technical constraints
5. **Plan** - Creates implementation roadmap
   - Complex issues: Detailed dedicated planning phase
   - Simple issues: Combined analysis + planning in one step
6. **Environment Setup** - Creates worktree, database branch, environment variables
7. **Launch** - Opens IDE with color theme and starts development server

**Examples:**

```bash
# Start work on GitHub issue #25
il start 25

# Start work on Linear issue ILM-42
il start ILM-42

# Create a new issue and start work
il start "Add dark mode toggle to settings"

# Start with full automation (skip all prompts)
il start 25 --one-shot=bypassPermissions

# Force create as child loom when working inside another loom
il start 42 --child-loom

# Create independent loom even when inside another loom
il start 99 --no-child-loom
```

**Notes:**
- When run from inside an existing loom, prompts to create a child loom (unless flags override)
- Creates isolated environment: Git worktree, database branch, unique port
- All AI analysis is posted as issue comments for team visibility
- Color codes the VS Code window for visual context switching

---

### il finish

Validate, commit, merge, and cleanup a loom workspace with AI-assisted error resolution.

**Alias:** `dn`

**Usage:**
```bash
il finish [options]
```

**Must be run from within a loom directory.**

**Options:**

| Flag | Description |
|------|-------------|
| `-f`, `--force` | Skip confirmation prompts |
| `-n`, `--dry-run` | Preview actions without executing |
| `--pr` | Treat input as PR number |
| `--skip-build` | Skip post-merge build verification |
| `--no-browser` | Skip opening PR in browser (github-pr mode only) |
| `--cleanup` | Clean up worktree after PR creation (github-pr mode only) |
| `--no-cleanup` | Keep worktree after PR creation (github-pr mode only) |

**Merge Behavior Modes:**

Behavior depends on the `mergeBehavior.mode` setting in your iloom configuration:

**`local` (default):**
1. Detects uncommitted changes and auto-commits
2. Runs validation pipeline: typecheck, lint, tests
3. If failures occur, launches Claude to help fix issues
4. Rebases on main branch
5. Validates fast-forward merge is possible
6. Merges to main
7. Installs dependencies in main
8. Runs post-merge build verification
9. Cleans up worktree and database branch

**`github-pr`:**
1. Same validation pipeline as local mode
2. Pushes branch to remote
3. Creates GitHub pull request
4. Opens PR in browser (unless `--no-browser`)
5. Prompts for cleanup (or use `--cleanup`/`--no-cleanup` flags)

**Examples:**

```bash
# Standard finish workflow
il finish

# Preview what will happen without executing
il finish --dry-run

# Finish and skip confirmation prompts
il finish --force

# Create PR and keep worktree for additional changes
il finish --no-cleanup

# Create PR without opening browser
il finish --no-browser
```

**Migration Conflict Handling:**

For Payload CMS projects, iloom automatically detects and handles migration conflicts:
- Identifies migration file conflicts
- Launches Claude to help resolve discrepancies
- Validates schema consistency

**Notes:**
- Claude assists with fixing any test, typecheck, or lint failures
- Automatically generates commit message from issue context
- Handles merge conflicts with AI assistance
- Cleans up all resources: worktree, database branch, dev server

---

### il rebase

Rebase current loom branch on the main branch with AI-assisted conflict resolution.

**Usage:**
```bash
il rebase [options]
```

**Must be run from within a loom directory.**

**Options:**

| Flag | Description |
|------|-------------|
| `-f`, `--force` | Skip confirmation prompts |
| `-n`, `--dry-run` | Preview actions without executing |

**Workflow:**

1. Fetches latest changes from main branch
2. Attempts to rebase current branch
3. If conflicts occur, launches Claude to help resolve
4. Validates resolution and completes rebase

**Examples:**

```bash
# Rebase with confirmation prompt
il rebase

# Rebase and skip confirmation
il rebase --force

# Preview rebase without executing
il rebase --dry-run
```

**Notes:**
- Useful when main branch has advanced and you need to sync
- Claude provides context-aware conflict resolution assistance
- Safe to run multiple times

---

### il cleanup

Remove one or more loom workspaces without merging.

**Usage:**
```bash
il cleanup [options] [identifier]
```

**Arguments:**
- `[identifier]` - Branch name or issue number to cleanup (auto-detected if omitted)

**Options:**

| Flag | Description |
|------|-------------|
| `-l`, `--list` | List all worktrees |
| `-a`, `--all` | Remove all worktrees (interactive confirmation) |
| `-i`, `--issue` | Cleanup by issue number |
| `-f`, `--force` | Skip confirmations and force removal |
| `--dry-run` | Show what would be done without doing it |

**Workflow:**

1. Identifies matching loom(s)
2. Confirms deletion (unless forced)
3. Removes Git worktree
4. Deletes database branch (if configured)
5. Removes loom directory

**Examples:**

```bash
# Cleanup specific loom by issue number
il cleanup 25

# Cleanup by issue number explicitly
il cleanup -i 25

# List all worktrees
il cleanup --list

# Preview cleanup without executing
il cleanup 25 --dry-run

# Remove all worktrees (interactive)
il cleanup --all

# Force cleanup without confirmation
il cleanup 25 --force
```

**Safety:**
- Checks for uncommitted changes and warns
- Cannot cleanup currently active loom
- Database branches are safely deleted

---

### il list

Display all active loom workspaces with their details.

**Usage:**
```bash
il list [options]
```

**Options:**

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON |

**Output includes:**
- Issue/PR number and title
- Branch name
- Loom directory path
- Development server port (for web projects)
- CLI binary name (for CLI projects)
- Database branch name (if configured)
- Current status (active, has uncommitted changes, etc.)

**Examples:**

```bash
# List all looms
il list

# Output example:
# Active Looms:
# ──────────────────────────────────────────────────────
#  #25  feat-add-dark-mode
#       ~/my-project-looms/feat-issue-25-dark-mode/
#       Port: 3025 | DB: br-issue-25
#
#  #42  fix-authentication-bug
#       ~/my-project-looms/fix-issue-42-auth/
#       Port: 3042 | DB: br-issue-42
```

---

## Context & Development Commands

### il spin

Launch Claude CLI with auto-detected loom context.

**Usage:**
```bash
il spin [options]
```

**Options:**

| Flag | Values | Description |
|------|--------|-------------|
| `--one-shot` | `noReview`, `bypassPermissions` | Automation level (same as `il start`) |

**Behavior:**

- **Inside a loom:** Launches Claude with that loom's context preloaded
- **Outside a loom:** Launches Claude with general project context

**Context Loading:**

When launched from inside a loom, Claude receives:
- Issue/PR description and all comments
- AI-generated enhancement, analysis, and planning
- Current file tree and recent changes
- Environment details (port, database branch, etc.)

**Examples:**

```bash
# Launch Claude with current loom context
il spin

# Launch with full automation
il spin --one-shot=bypassPermissions
```

---

### il open

Open loom in browser (web projects) or run configured CLI tool (CLI projects).

**Alias:** `run`

**Usage:**
```bash
il open [identifier]
```

**Arguments:**
- `[identifier]` - Optional issue number or loom identifier
- If omitted and inside a loom, opens current loom
- If omitted outside a loom, prompts for selection

**Behavior by Project Type:**

**Web Projects:**
- Opens development server in default browser
- Uses the loom's unique port (e.g., http://localhost:3025)

**CLI Projects:**
- Runs the loom-specific binary
- Executes with any additional arguments passed

**Examples:**

```bash
# Open current loom
il open

# Open specific loom by issue number
il open 25

# For CLI projects, run with arguments
il open 25 --help
il open 25 --version
```

---

## Issue Management Commands

### il add-issue

Create and AI-enhance a new issue without starting a loom.

**Alias:** `a`

**Usage:**
```bash
il add-issue "<description>"
```

**Arguments:**
- `<description>` - Brief or detailed issue description

**Workflow:**

1. Creates issue in configured tracker (GitHub or Linear)
2. Runs enhancement agent to expand description
3. Posts enhancement as issue comment
4. Opens issue in browser

**Examples:**

```bash
# Create a new issue
il add-issue "Add dark mode toggle to settings"

# Create issue with more detail
il add-issue "Users report authentication fails after password reset. Need to investigate token refresh flow."
```

**Notes:**
- Does NOT create a loom workspace
- Useful for backlog grooming and planning
- Enhancement makes issues more actionable for future work
- Use `il start <issue-number>` later to begin work

---

### il enhance

Apply AI enhancement agent to an existing issue.

**Usage:**
```bash
il enhance [options] <issue-number>
```

**Arguments:**
- `<issue-number>` - Existing issue number from GitHub or Linear

**Options:**

| Flag | Description |
|------|-------------|
| `--no-browser` | Skip browser opening prompt |
| `--author` | GitHub username to tag in questions (for CI usage) |

**Workflow:**

1. Fetches existing issue
2. Analyzes current description and comments
3. Generates enhanced requirements and context
4. Posts enhancement as new issue comment
5. Opens issue in browser (unless `--no-browser`)

**Examples:**

```bash
# Enhance existing issue
il enhance 42

# Enhance without opening browser
il enhance 42 --no-browser

# Enhance and tag specific user in questions
il enhance 42 --author acreeger

# Useful for issues created before iloom adoption
il enhance 127
```

**Notes:**
- Does not modify original issue description
- Posts enhancement as a separate comment
- Can be run multiple times as issue evolves
- Does NOT create a loom workspace
- Useful for CI/automation with `--no-browser` and `--author` flags

---

## Configuration & Maintenance

### il init / il config

Interactive configuration wizard powered by Claude.

**Aliases:** `init`, `config`, `configure`

**Usage:**
```bash
il init [description]
il config [description]
```

**Arguments:**
- `[description]` - Optional natural language description of what to configure

**Workflow:**

Without description (standard wizard):
1. Detects project type and existing configuration
2. Guides through all configuration options
3. Creates/updates `.iloom/settings.json` and `.iloom/settings.local.json`
4. Sets up `.gitignore` entries
5. Validates configuration

With description (natural language):
1. Claude interprets your intent
2. Focuses on specific configuration areas
3. Makes targeted updates

**Examples:**

```bash
# Standard interactive wizard
il init

# Natural language configuration
il init "set my IDE to windsurf and help me configure linear"
il init "switch to github-pr merge mode"
il init "configure neon database with project ID abc-123"
```

**Configuration Areas:**
- Issue tracker (GitHub/Linear)
- Database provider (Neon)
- IDE preference (VS Code, Cursor, Windsurf, etc.)
- Merge behavior (local vs github-pr)
- Permission modes
- Project type (web app, CLI tool, etc.)
- Base port for development servers
- Environment variable names

---

### il update

Update iloom CLI to the latest version.

**Usage:**
```bash
il update [options]
```

**Options:**

| Flag | Description |
|------|-------------|
| `--dry-run` | Show what would be done without actually updating |

**Workflow:**

1. Checks npm registry for latest version
2. Compares with currently installed version
3. If update available, installs latest version
4. Displays changelog/release notes

**Examples:**

```bash
# Check for updates and install if available
il update

# Preview update without installing
il update --dry-run
```

**Notes:**
- Uses npm global install under the hood
- Preserves your configuration files
- Safe to run at any time

---

### il feedback

Submit bug reports or feature requests directly to the iloom repository.

**Alias:** `f`

**Usage:**
```bash
il feedback [options] "<description>"
```

**Arguments:**
- `<description>` - Natural language description of feedback (must be >50 chars with >2 spaces)

**Options:**

| Flag | Description |
|------|-------------|
| `--body` | Body text for feedback (added after diagnostics) |

**Workflow:**

1. Creates new issue in [iloom-cli repository](https://github.com/iloom-ai/iloom-cli)
2. Opens issue in browser for you to add context
3. Within minutes, iloom's enhancement agent processes your feedback
4. Issue is prioritized and reviewed

**Examples:**

```bash
# Report a bug
il feedback "The worktree cleanup seems to leave temp files behind"

# Request a feature
il feedback "Add support for GitLab issue tracking"

# Report unexpected behavior
il feedback "Tests fail on finish but Claude doesn't launch to help fix"
```

**Best Practices:**
- Be specific about what you expected vs. what happened
- Include environment details (OS, Node version) for bugs
- Mention the command or workflow that had issues
- Suggest improvements or alternative approaches

---

### il contribute

Set up development environment for contributing to iloom.

**Usage:**
```bash
il contribute
```

**Workflow:**

1. Forks iloom-cli repository to your GitHub account
2. Clones your fork locally
3. Sets up upstream remote
4. Installs dependencies
5. Runs initial build and tests
6. Creates starter development environment
7. Opens contributing guide

**Examples:**

```bash
# Set up iloom development environment
il contribute
```

**Notes:**
- Requires GitHub CLI (`gh`) to be authenticated
- Creates fork if it doesn't exist
- Sets up recommended development settings
- Automatically creates a loom for your first contribution
- See [CONTRIBUTING.md](../CONTRIBUTING.md) for detailed guidelines

---

## Global Flags

Some flags work across multiple commands:

| Flag | Commands | Description |
|------|----------|-------------|
| `--one-shot` | `start`, `spin` | Automation level for Claude workflows |
| `--force`, `-f` | `finish`, `rebase` | Skip confirmation prompts |
| `--dry-run`, `-n` | `finish`, `rebase` | Preview without executing |
| `--help`, `-h` | All commands | Display command help |
| `--version`, `-v` | All commands | Display iloom version |

---

## Environment Variables

iloom respects these environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `ILOOM_SETTINGS_PATH` | Override default settings file location | `~/.config/iloom-ai/settings.json` |
| `ILOOM_NO_COLOR` | Disable colored output | `false` |
| `ILOOM_DEBUG` | Enable debug logging | `false` |
| `CLAUDE_API_KEY` | Claude API key (if not using Claude CLI) | - |

---

## Additional Resources

- [Main README](../README.md) - Overview and quick start
- [Configuration Guide](./configuration.md) - Detailed configuration options
- [Troubleshooting Guide](./troubleshooting.md) - Common issues and solutions
- [Contributing Guide](../CONTRIBUTING.md) - How to contribute to iloom
