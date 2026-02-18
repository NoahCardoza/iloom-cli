---
name: iloom
description: Manage isolated Git worktrees and AI-assisted development workflows with iloom CLI. Use when you need to create workspaces for issues/PRs, commit and merge code, run dev servers, plan and decompose features into issues, enhance issue descriptions with AI, list active workspaces, or configure iloom projects. Covers the full loom lifecycle (init, start, finish, cleanup) and all development commands (spin, commit, rebase, build, test, lint). Also use when the user has an idea for improvement or new feature — route through `il plan` for ideation and decomposition.
metadata: { "openclaw": { "emoji": "🧵", "requires": { "anyBins": ["il", "iloom"] } } }
---

# iloom

Manage isolated Git worktrees with AI-assisted development workflows.

## PTY and Background Requirements

Not all iloom commands need PTY or background mode. Use the right mode for each command:

### No PTY needed (plain exec)

These return clean JSON and complete quickly:

```bash
bash command:"il list --json"
bash command:"il issues --json"
bash command:"il projects --json"
bash command:"il recap --json"
bash command:"il --version"
bash command:"il start <issue#> --no-claude --no-code --no-dev-server --json"
bash command:"il cleanup --issue <N> --force --json"
bash command:"il finish --force --cleanup --no-browser --json"
bash command:"il commit --no-review --json"
```

### Background mode required (long-running, launches Claude)

These spawn Claude Code sessions that can run 1-10+ minutes. Always use `background:true`:

```bash
bash background:true command:"il plan --yolo --print --json-stream"
bash background:true command:"il spin --yolo --print --json-stream"
bash background:true command:"il start <issue#> --yolo --json"  # with Claude (default)
bash background:true command:"il summary --json"
bash background:true command:"il enhance <N> --no-browser --json"
# Monitor: process action:poll sessionId:XXX
```

### Foreground PTY only (interactive, not for AI agents)

```bash
il init    # Interactive wizard — use manual setup instead
il shell   # Opens interactive subshell
il rebase  # May need Claude for conflict resolution
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

## Workflow: Choosing the Right Approach

### Sizeable Changes (multiple issues, architectural work)

For anything non-trivial, use the **plan → review → start → spin** workflow:

1. **Plan:** Decompose the work into issues
   ```bash
   bash background:true command:"il plan --yolo --print --json-stream"
   # Monitor: process action:poll sessionId:XXX
   ```

2. **Review:** Present the created epic to the user for review (unless they've said to proceed without review). Wait for approval before continuing.

3. **Start:** Create the workspace without launching Claude or dev server
   ```bash
   bash command:"il start <issue#> --yolo --no-code --no-dev-server --no-claude --json"
   ```

4. **Spin:** Launch Claude separately with streaming output
   ```bash
   bash background:true command:"il spin --yolo --print --json-stream"
   # Monitor: process action:poll sessionId:XXX
   ```

5. **Finish:** Merge and clean up
   ```bash
   bash command:"il finish --force --cleanup --no-browser --json"
   ```

### Small Changes (single issue, quick fix)

For small, self-contained tasks, use inline start with a description:

```bash
bash background:true command:"il start 'Add dark mode support to the settings page' --yolo --no-code --json"
# Monitor: process action:poll sessionId:XXX
```

This creates the issue, workspace, and launches Claude in one step.

## Quick Reference

### Check active workspaces

```bash
bash command:"il list --json"
```

### Commit with AI-generated message

```bash
bash command:"il commit --no-review --json"
```

## Ideation and Planning

When the user has an idea for an improvement, new feature, or wants to decompose work into issues, use `il plan`:

```bash
bash background:true command:"il plan --yolo --print --json-stream"
# Monitor: process action:poll sessionId:XXX
# Full log: process action:log sessionId:XXX
```

`il plan` launches an autonomous AI planning session that reads the codebase and creates structured issues with dependencies. Always prefer this over manually creating issues.

**Important:** Both `plan` and `spin` should always be run in **background mode** (`background:true`) with `--print --json-stream`. These commands can run for several minutes (especially with Opus) as they analyze the codebase, and foreground timeouts will kill them. The `--json-stream` flag ensures incremental output is visible via `process action:poll`.

## References

- **Project initialization and settings schema:** See `{baseDir}/references/initialization.md`
- **Core lifecycle commands (init, start, finish, cleanup, list):** See `{baseDir}/references/core-workflow.md`
- **Development commands (spin, commit, rebase, build, test, etc.):** See `{baseDir}/references/development-commands.md`
- **Planning and issue management (plan, add-issue, enhance, issues):** See `{baseDir}/references/planning-and-issues.md`
- **Settings, env vars, and global flags:** See `{baseDir}/references/configuration.md`
- **Non-interactive patterns (PTY, background, autonomous operation):** See `{baseDir}/references/non-interactive-patterns.md`

## Safety Rules

1. **Use the right execution mode** for each command — see PTY and Background Requirements above. Most commands work without PTY.
2. **Use `background:true`** for commands that launch Claude: `start` (with Claude), `spin`, `plan`, `summary`, `enhance`.
3. **Never run `il finish` without `--force`** in autonomous mode — it will hang on confirmation prompts.
4. **Always pass explicit flags** to avoid interactive prompts. See `{baseDir}/references/non-interactive-patterns.md` for the complete decision bypass map.
5. **Use `--json`** when you need to parse command output programmatically.
6. **Prefer manual initialization** over `il init` — create `.iloom/settings.json` directly. See `{baseDir}/references/initialization.md`.
7. **Respect worktree isolation** — each loom is an independent workspace. Run commands from within the correct worktree directory.
8. **NEVER kill a background session you did not start.** Other looms may be running from separate planning or development sessions (the user's own work, other agents, or prior conversations). When you see unfamiliar background sessions, **leave them alone**. Only kill sessions you explicitly launched in the current workflow. If unsure, ask the user.
9. **Send progress updates mid-turn.** Long-running loom operations (plan, spin, commit, finish) can take minutes. Use the `message` tool to send incremental status updates to the user while waiting — don't go silent. Examples: "🧵 Spin started for issue #5, monitoring…", "✅ Tests passing, spin entering code review phase", "🔀 Merging to main…". Keep the user in the loop.
