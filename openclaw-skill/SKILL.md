---
name: iloom
description: Manage isolated Git worktrees and AI-assisted development workflows with iloom CLI. Use when you need to create workspaces for issues/PRs, commit and merge code, run dev servers, plan and decompose features into issues, enhance issue descriptions with AI, list active workspaces, or configure iloom projects. Covers the full loom lifecycle (init, start, finish, cleanup) and all development commands (spin, commit, rebase, build, test, lint). Also use when the user has an idea for improvement or new feature — route through `il plan` for ideation and decomposition.
metadata: { "openclaw": { "emoji": "🧵", "requires": { "anyBins": ["il", "iloom"] } } }
---

# iloom

Manage isolated Git worktrees with AI-assisted development workflows.

## PTY Mode Required

iloom is an **interactive terminal application**. Always use `pty:true` when running iloom commands:

```bash
# Correct - with PTY
bash pty:true command:"il list --json"

# Wrong - may break output or hang
bash command:"il list --json"
```

## Repository Setup (Forking & Remotes)

When working on a forked repository, **always use standard remote naming**:

- **`origin`** = your fork (you have push access)
- **`upstream`** = the original repo (read-only for contributors)

iloom defaults to `origin` for push operations (draft PRs, branch pushing). If `origin` points to a repo you can't write to, pushes will fail.

### Setting up a fork correctly

```bash
# Clone your fork (this sets origin = your fork automatically)
gh repo fork <owner>/<repo> --clone

# Or manually:
git clone git@github.com:<you>/<repo>.git
cd <repo>
git remote add upstream git@github.com:<owner>/<repo>.git
```

### If remotes are already misconfigured

```bash
# Check current remotes
git remote -v

# Rename to follow convention
git remote rename origin upstream
git remote rename fork origin
```

### Configuring iloom for fork workflows

If issues live on the upstream repo but you push to your fork, add to `.iloom/settings.local.json`:

```json
{
  "issueManagement": {
    "github": { "remote": "upstream" }
  },
  "mergeBehavior": {
    "remote": "origin"
  }
}
```

> **⚠️ Do not auto-configure remotes.** If multiple remotes are detected, ask the user which remote to use for issues and which for pushing. Use `.iloom/settings.local.json` (not the shared `settings.json`) since this is a per-developer preference.

## Project Initialization (First-Time Setup)

Before using any iloom commands, the project must be initialized:

```bash
# 1. Initialize your project (if not already done)
bash pty:true command:"pnpm init"    # or npm init, cargo init, etc.

# 2. Initialize git (if not already done)
bash pty:true command:"git init && git add -A && git commit -m 'Initial commit'"

# 3. Initialize iloom (interactive setup wizard)
bash pty:true command:"il init"
```

`il init` launches an interactive configuration wizard. It must run in the foreground with PTY.

## Quick Start

### Check active workspaces

```bash
bash pty:true command:"il list --json"
```

### Start a loom for an issue (launches Claude in background)

```bash
bash pty:true background:true command:"il start 42 --yolo --no-code --json"
# Monitor: process action:log sessionId:XXX
# Check:   process action:poll sessionId:XXX
```

### Finish and merge a loom

```bash
bash pty:true command:"il finish --force --cleanup --no-browser --json"
```

### Launch Claude in existing loom

```bash
bash pty:true background:true command:"il spin --yolo"
# Monitor: process action:log sessionId:XXX
```

### Commit with AI-generated message

```bash
bash pty:true command:"il commit --no-review --json"
```

## Ideation and Planning

When the user has an idea for an improvement, new feature, or wants to decompose work into issues, use `il plan`:

```bash
bash pty:true background:true command:"il plan --yolo"
# Or for headless output:
bash pty:true command:"il plan --yolo --print --output-format json"
```

`il plan` launches an interactive AI planning session that creates structured issues with dependencies. Always prefer this over manually creating issues.

## References

- **Core lifecycle commands (init, start, finish, cleanup, list):** See `{baseDir}/references/core-workflow.md`
- **Development commands (spin, commit, rebase, build, test, etc.):** See `{baseDir}/references/development-commands.md`
- **Planning and issue management (plan, add-issue, enhance, issues):** See `{baseDir}/references/planning-and-issues.md`
- **Settings, env vars, and global flags:** See `{baseDir}/references/configuration.md`
- **Non-interactive patterns (PTY, background, autonomous operation):** See `{baseDir}/references/non-interactive-patterns.md`

## Safety Rules

1. **Always use `pty:true`** for every iloom command.
2. **Use `background:true`** for commands that launch Claude: `start`, `spin`, `plan`.
3. **Never run `il finish` without `--force`** in autonomous mode — it will hang on confirmation prompts.
4. **Always pass explicit flags** to avoid interactive prompts. See `{baseDir}/references/non-interactive-patterns.md` for the complete decision bypass map.
5. **Use `--json`** when you need to parse command output programmatically.
6. **Do not run `il init` in background mode** — it requires foreground interactive setup.
7. **Respect worktree isolation** — each loom is an independent workspace. Run commands from within the correct worktree directory.

## Troubleshooting

### "Permission denied" when pushing draft PRs

```
ERROR: Permission to <owner>/<repo>.git denied to <you>.
```

**Cause:** `origin` points to the upstream repo instead of your fork. iloom pushes to `origin` by default.

**Fix:** Rename remotes to follow convention (`origin` = your fork, `upstream` = original repo):

```bash
git remote rename origin upstream
git remote rename fork origin   # or whatever your fork remote is named
```

Then update `.iloom/settings.local.json` if needed (see "Repository Setup" section above).
