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
bash command:"il start <issue#> --no-claude --no-code --no-dev-server --no-terminal --json"
bash command:"il cleanup --issue <N> --force --json"
bash command:"il build"
bash command:"il test"
bash command:"il lint"
```

### Background mode required (long-running, launches Claude or extended ops)

These spawn Claude Code sessions or run extended operations. Always use `background:true`:

```bash
bash background:true command:"il plan --yolo --print --json-stream"
bash background:true command:"il spin --yolo --print --json-stream"
bash background:true command:"il start <issue#> --yolo --no-code --no-terminal --json"  # with Claude (default)
bash background:true command:"il summary --json"
bash background:true command:"il enhance <N> --no-browser --json"
bash background:true command:"il commit --no-review --json-stream"
bash background:true command:"il finish --force --cleanup --no-browser --json-stream"
bash background:true command:"il rebase --force --json-stream"
# Monitor: process action:poll sessionId:XXX
```

### Foreground PTY only (interactive, not for AI agents)

```bash
il init    # Interactive wizard — use manual setup instead
il shell   # Opens interactive subshell
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

When a project has **multiple git remotes** (e.g., `origin` + `upstream`), iloom needs to know which remote to use for different operations.

**Do NOT auto-configure remotes.** Instead, **ask the user** which remote to target. The correct choice depends on their workflow and permissions.

### Understanding the Two Remote Settings

- **`issueManagement.github.remote`** — The **canonical GitHub repository** for all GitHub operations: listing/creating issues, opening PRs, commenting, closing issues. In a fork workflow, this is typically `upstream` because issues and PRs live on the original repo.

- **`mergeBehavior.remote`** — The remote iloom **pushes branches to**. In a fork workflow, this is typically `origin` (your fork), because you have push access there. iloom pushes your branch here, then opens a cross-fork PR on the `issueManagement` repo.

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
- `upstream` = the original repo (where issues and PRs live)

iloom assumes `origin` is yours by default. If remotes are named differently, configure both settings explicitly.

### Common Patterns

| Workflow | `issueManagement.github.remote` | `mergeBehavior.remote` | Notes |
|----------|--------------------------------|----------------------|-------|
| **Fork workflow** | `upstream` | `origin` | Issues/PRs on upstream, push to your fork |
| **Direct access** | `origin` | `origin` | No fork — no extra config needed |
| **Fork with local issues** | `origin` | `origin` | Issues on your fork (e.g., fork has issues enabled) |

## Workflow: Choosing the Right Approach

### Sizeable Changes (multiple issues, architectural work)

For anything non-trivial, use the **plan → review → start → spin** workflow:

1. **Plan:** Decompose the work into issues (prompt is required with `--yolo`)
   ```bash
   bash background:true command:"il plan --yolo --print --json-stream 'Description of work to plan'"
   # Monitor: process action:poll sessionId:XXX
   ```

2. **Review:** Present the created epic to the user for review (unless they've said to proceed without review). Wait for approval before continuing.

3. **Start:** Create the workspace without launching Claude or dev server
   ```bash
   bash command:"il start <issue#> --yolo --no-code --no-dev-server --no-claude --no-terminal --json"
   ```

4. **Spin:** Launch Claude separately with streaming output
   ```bash
   bash background:true command:"il spin --yolo --print --json-stream"
   # Monitor: process action:poll sessionId:XXX
   ```

5. **Finish:** Merge and clean up
   ```bash
   bash background:true command:"il finish --force --cleanup --no-browser --json-stream"
   # Monitor: process action:poll sessionId:XXX
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
bash background:true command:"il commit --no-review --json-stream"
# Monitor: process action:poll sessionId:XXX
```

## Ideation and Planning

When the user has an idea for an improvement, new feature, or wants to decompose work into issues, use `il plan`:

```bash
bash background:true command:"il plan --yolo --print --json-stream 'Describe the feature or work to plan'"
# Monitor: process action:poll sessionId:XXX
# Full log: process action:log sessionId:XXX
```

`il plan` launches an autonomous AI planning session that reads the codebase and creates structured issues with dependencies. Always prefer this over manually creating issues.

**Important:** `--yolo` mode requires a **prompt argument** (a description string) or an **issue identifier** (e.g., `il plan --yolo 42`). Without one, the command will fail immediately.

**Important:** Commands that can run for extended periods — `plan`, `spin`, `commit`, `finish`, and `rebase` — should be run in **background mode** (`background:true`) with `--json-stream` (and `--print` for plan/spin). The `--json-stream` flag streams JSONL incrementally so you can monitor progress via `process action:poll`. Without it, you get zero visibility until the command completes.

## References

- **Project initialization and settings schema:** See `{baseDir}/references/initialization.md`
- **Core lifecycle commands (init, start, finish, cleanup, list):** See `{baseDir}/references/core-workflow.md`
- **Development commands (spin, commit, rebase, build, test, etc.):** See `{baseDir}/references/development-commands.md`
- **Planning and issue management (plan, add-issue, enhance, issues):** See `{baseDir}/references/planning-and-issues.md`
- **Settings, env vars, and global flags:** See `{baseDir}/references/configuration.md`
- **Non-interactive patterns (PTY, background, autonomous operation):** See `{baseDir}/references/non-interactive-patterns.md`

## Safety Rules

1. **Use the right execution mode** for each command — see PTY and Background Requirements above. Most commands work without PTY.
2. **Use `background:true`** for commands that launch Claude or run extended operations: `start` (with Claude), `spin`, `plan`, `commit`, `finish`, `rebase`.
3. **Never run `il finish` without `--force`** in autonomous mode — it will hang on confirmation prompts.
4. **Always pass explicit flags** to avoid interactive prompts. See `{baseDir}/references/non-interactive-patterns.md` for the complete decision bypass map.
5. **Use `--json`** when you need to parse command output programmatically. **`--json` and `--json-stream` are mutually exclusive** — prefer `--json-stream` for commands that support it (commit, finish, rebase) since it provides incremental visibility. Use `--json` only for commands without `--json-stream` support (list, cleanup, start, etc.).
6. **Prefer manual initialization** over `il init` — create `.iloom/settings.json` directly. See `{baseDir}/references/initialization.md`.
7. **Respect worktree isolation** — each loom is an independent workspace. Run commands from within the correct worktree directory.
8. **NEVER kill a background session you did not start.** Other looms may be running from separate planning or development sessions (the user's own work, other agents, or prior conversations). When you see unfamiliar background sessions, **leave them alone**. Only kill sessions you explicitly launched in the current workflow. If unsure, ask the user.
9. **Send progress updates mid-turn.** Long-running loom operations (plan, spin, commit, finish) can take minutes. Use the `message` tool to send incremental status updates to the user while waiting — don't go silent. Examples: "🧵 Spin started for issue #5, monitoring…", "✅ Tests passing, spin entering code review phase", "🔀 Merging to main…". Keep the user in the loop.
10. **GitHub labels must already exist on the repo.** `gh issue create --label` will fail if the label doesn't exist. If the user has **write or triage permissions** on the `issueManagement.github.remote` repo, you can create labels first (`gh label create <name> -R <repo>`). Otherwise, list existing labels (`gh label list -R <repo>`) and only use those, or omit labels entirely if none match.
