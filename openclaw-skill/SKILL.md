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

## Project Initialization (First-Time Setup)

Before using any iloom commands, the project must have a `.iloom/settings.json` file.

**Preferred: Manual setup (recommended for AI agents)**

Create the settings files directly — no interactive wizard needed:

```bash
mkdir -p .iloom
echo '{"mainBranch": "main"}' > .iloom/settings.json
```

See `{baseDir}/references/initialization.md` for the complete settings schema, all configuration options, and example configurations.

**Alternative: Interactive wizard (for humans at a terminal)**

```bash
bash pty:true command:"il init"
```

`il init` launches an interactive Claude-guided configuration wizard. It requires foreground PTY and is designed for human interaction — **not recommended for AI agents** due to nested interactive prompts and timeout sensitivity.

## GitHub Remote Configuration (Fork Workflows)

When a project has **multiple git remotes** (e.g., `origin` + `fork`, or `upstream` + `origin`), iloom needs to know which remote to use for issue management and which to push to.

**Do NOT auto-configure `issueManagement.github.remote`.** Instead, **ask the user** which remote to target. The correct choice depends on:

- Whether the user has write access to the upstream repo
- Whether issues live on the upstream or the fork
- Whether PRs should target the upstream or the fork

**Use `.iloom/settings.local.json`** (not the shared `settings.json`) for per-developer remote configuration, since this is a personal preference that shouldn't be committed:

```json
{
  "issueManagement": {
    "github": {
      "remote": "upstream"
    }
  },
  "mergeBehavior": {
    "remote": "origin"
  }
}
```

**Standard remote naming convention:**
- `origin` = your fork (where you have push access)
- `upstream` = the original repo (where issues live)

iloom assumes `origin` is yours by default. If remotes are named differently, configure `issueManagement.github.remote` and `mergeBehavior.remote` explicitly.

Common patterns:
- **Fork workflow:** Issues on `upstream`, push/PR from `origin` (your fork)
- **Direct access (no fork):** Both issues and push on `origin` — no extra config needed

## Workflow: Choosing the Right Approach

### Sizeable Changes (multiple issues, architectural work)

For anything non-trivial, use the **plan → review → start → spin** workflow:

1. **Plan:** Decompose the work into issues
   ```bash
   bash pty:true background:true command:"il plan --yolo --print --json-stream"
   # Monitor: process action:poll sessionId:XXX
   ```

2. **Review:** Present the created epic to the user for review (unless they've said to proceed without review). Wait for approval before continuing.

3. **Start:** Create the workspace without launching Claude or dev server
   ```bash
   bash pty:true command:"il start <issue#> --yolo --no-code --no-dev-server --no-claude --no-terminal --json"
   ```

4. **Spin:** Launch Claude separately with streaming output
   ```bash
   bash pty:true background:true command:"il spin --yolo --print --json-stream"
   # Monitor: process action:poll sessionId:XXX
   ```

5. **Finish:** Merge and clean up
   ```bash
   bash pty:true background:true command:"il finish --force --cleanup --no-browser --json --json-stream"
   # Monitor: process action:poll sessionId:XXX
   ```

### Small Changes (single issue, quick fix)

For small, self-contained tasks, use inline start with a description:

```bash
bash pty:true background:true command:"il start 'Add dark mode support to the settings page' --yolo --no-code --json"
# Monitor: process action:poll sessionId:XXX
```

This creates the issue, workspace, and launches Claude in one step.

## Quick Reference

### Check active workspaces

```bash
bash pty:true command:"il list --json"
```

### Commit with AI-generated message

```bash
bash pty:true background:true command:"il commit --no-review --json --json-stream"
# Monitor: process action:poll sessionId:XXX
```

## Ideation and Planning

When the user has an idea for an improvement, new feature, or wants to decompose work into issues, use `il plan`:

```bash
bash pty:true background:true command:"il plan --yolo --print --json-stream"
# Monitor: process action:poll sessionId:XXX
# Full log: process action:log sessionId:XXX
```

`il plan` launches an autonomous AI planning session that reads the codebase and creates structured issues with dependencies. Always prefer this over manually creating issues.

**Important:** Commands that can run for extended periods — `plan`, `spin`, `commit`, `finish`, and `rebase` — should be run in **background mode** (`background:true`) with `--json-stream` (and `--print` for plan/spin). The `--json-stream` flag streams JSONL incrementally so you can monitor progress via `process action:poll`. Without it, you get zero visibility until the command completes.

## References

- **Project initialization and settings schema:** See `{baseDir}/references/initialization.md`
- **Core lifecycle commands (init, start, finish, cleanup, list):** See `{baseDir}/references/core-workflow.md`
- **Development commands (spin, commit, rebase, build, test, etc.):** See `{baseDir}/references/development-commands.md`
- **Planning and issue management (plan, add-issue, enhance, issues):** See `{baseDir}/references/planning-and-issues.md`
- **Settings, env vars, and global flags:** See `{baseDir}/references/configuration.md`
- **Non-interactive patterns (PTY, background, autonomous operation):** See `{baseDir}/references/non-interactive-patterns.md`

## Safety Rules

1. **Always use `pty:true`** for every iloom command.
2. **Use `background:true`** for commands that launch Claude or run extended operations: `start`, `spin`, `plan`, `commit`, `finish`, `rebase`.
3. **Never run `il finish` without `--force`** in autonomous mode — it will hang on confirmation prompts.
4. **Always pass explicit flags** to avoid interactive prompts. See `{baseDir}/references/non-interactive-patterns.md` for the complete decision bypass map.
5. **Use `--json`** when you need to parse command output programmatically.
6. **Prefer manual initialization** over `il init` — create `.iloom/settings.json` directly. See `{baseDir}/references/initialization.md`.
7. **Respect worktree isolation** — each loom is an independent workspace. Run commands from within the correct worktree directory.
8. **NEVER kill a background session you did not start.** Other looms may be running from separate planning or development sessions (the user's own work, other agents, or prior conversations). When you see unfamiliar background sessions, **leave them alone**. Only kill sessions you explicitly launched in the current workflow. If unsure, ask the user.
9. **Send progress updates mid-turn.** Long-running loom operations (plan, spin, commit, finish) can take minutes. Use the `message` tool to send incremental status updates to the user while waiting — don't go silent. Examples: "🧵 Spin started for issue #5, monitoring…", "✅ Tests passing, spin entering code review phase", "🔀 Merging to main…". Keep the user in the loop.
