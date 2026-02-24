# Non-Interactive Patterns

How to run iloom commands autonomously without hitting interactive prompts.

## PTY Requirement

iloom is an interactive terminal application built with Node.js. It uses colored output, spinners, and readline-based prompts that require a pseudo-terminal.

**Always use `pty:true`** for every iloom command:

```bash
# Correct
bash pty:true command:"il list --json"

# Wrong - output may break or command may hang
bash command:"il list --json"
```

---

## Background vs Foreground Commands

### Background Commands (use `background:true`)

These commands launch Claude Code and run for extended periods. **Always run in background** to avoid timeout kills:

| Command | Recommended Invocation |
|---------|----------------------|
| `il start` | `bash pty:true background:true command:"il start 42 --yolo --no-code --no-terminal --json"` |
| `il spin` | `bash pty:true background:true command:"il spin --yolo --print --json-stream"` |
| `il plan` | `bash pty:true background:true command:"il plan --yolo --print --json-stream"` |

**Why `--print --json-stream` for `plan` and `spin`?**
- `--print` enables headless/non-interactive output mode
- `--json-stream` streams JSONL incrementally so you can monitor progress via `process action:poll`
- Without `--json-stream`, `--print` buffers ALL output until completion (no visibility into what Claude is doing)
- These commands can easily run 3-10+ minutes with Opus analyzing a codebase — foreground timeouts will kill them

### Background Commands — Extended Operations

These commands use Claude for message generation, conflict resolution, or merge validation and support `--json-stream` for progress monitoring:

| Command | Recommended Invocation |
|---------|----------------------|
| `il commit` | `bash pty:true background:true command:"il commit --no-review --json-stream"` |
| `il finish` | `bash pty:true background:true command:"il finish --force --cleanup --no-browser --json-stream"` |
| `il rebase` | `bash pty:true background:true command:"il rebase --force --json-stream"` |

**Why `--json-stream` for these commands?**
- `commit` uses Claude to generate commit messages — can take 10-30s
- `finish` validates, commits, merges, and may trigger builds — can take 1-2+ minutes
- `rebase` may invoke Claude for conflict resolution — duration is unpredictable

### Foreground Commands (no `background:true`)

These commands complete quickly and return structured output:

| Command | Recommended Invocation |
|---------|----------------------|
| `il list` | `bash pty:true command:"il list --json"` |
| `il cleanup` | `bash pty:true command:"il cleanup --issue 42 --force --json"` |
| `il build` | `bash pty:true command:"il build"` |
| `il test` | `bash pty:true command:"il test"` |
| `il lint` | `bash pty:true command:"il lint"` |
| `il compile` | `bash pty:true command:"il compile"` |
| `il issues` | `bash pty:true command:"il issues --json"` |
| `il add-issue` | `bash pty:true command:"il add-issue 'description' --json"` |
| `il enhance` | `bash pty:true command:"il enhance 42 --no-browser --json"` |
| `il summary` | `bash pty:true command:"il summary --json"` |
| `il recap` | `bash pty:true command:"il recap --json"` |

### Special: Foreground Only (no background, no JSON)

| Command | Note |
|---------|------|
| `il init` | Interactive wizard, must run foreground. **Not recommended for AI agents** — use manual setup instead (see `{baseDir}/references/initialization.md`) |
| `il shell` | Opens interactive subshell |

---

## Session Lifecycle (Background Commands)

```bash
# 1. Start the command in background
bash pty:true background:true command:"il start 42 --yolo --no-code --json"
# Returns: sessionId

# 2. Check if still running
process action:poll sessionId:XXX

# 3. View output / progress
process action:log sessionId:XXX

# 4. Send input if the agent asks a question
process action:submit sessionId:XXX data:"yes"

# 5. Send raw data without newline
process action:write sessionId:XXX data:"y"

# 6. Terminate if needed (YOUR sessions only — see warning below)
process action:kill sessionId:XXX
```

> ⚠️ **CRITICAL: Never kill a session you did not start.**
>
> When listing background processes, you may see sessions from other workflows — the user's own planning sessions, other agents, or prior conversations. These are **not yours to manage**. Only kill sessions you explicitly launched in the current workflow. If you're unsure whether a session is yours, **ask the user** before terminating it. Killing someone else's long-running `plan` or `spin` session destroys work in progress that cannot be recovered.

---

## Decision Bypass Map

Every interactive prompt in iloom and the flag(s) that bypass it:

| Command | Prompt | Bypass Flag(s) |
|---------|--------|---------------|
| `start` | "Enter issue number..." | Provide `[identifier]` argument |
| `start` | "Create as a child loom?" | `--child-loom` or `--no-child-loom` |
| `start` | "bypassPermissions warning" | Already implied by `--yolo`; or `--no-claude` |
| `start` | Opens terminal window | `--no-terminal` |
| `finish` | "Clean up worktree?" | `--cleanup` or `--no-cleanup` |
| `finish` | Commit message review | `--force` |
| `finish` | General confirmations | `--force` |
| `cleanup` | "Remove this worktree?" | `--force` |
| `cleanup` | "Remove N worktree(s)?" | `--force` |
| `commit` | Commit message review | `--no-review` or `--json` |
| `enhance` | "Press q or key to view..." | `--no-browser` or `--json` |
| `enhance` | First-run setup | `--json` |
| `add-issue` | "Press key to view in browser" | `--json` |
| `add-issue` | First-run setup | `--json` |

---

## Recommended Autonomous Flag Combinations

### Full Autonomous Start (create workspace)

```bash
bash pty:true background:true command:"il start <issue> --yolo --no-code --no-terminal --json"
```

- `--yolo`: bypass all permission prompts
- `--no-code`: don't open VS Code
- `--no-terminal`: don't open a terminal window
- `--json`: structured output

### Full Autonomous Finish (merge and cleanup)

```bash
bash pty:true background:true command:"il finish --force --cleanup --no-browser --json-stream"
# Monitor: process action:poll sessionId:XXX
```

- `--force`: skip all confirmations
- `--cleanup`: auto-cleanup worktree
- `--no-browser`: don't open browser
- `--json`: structured output
- `--json-stream`: stream progress incrementally
- `background:true`: finish can take 1-2+ minutes (commit, merge, build verification)

### Headless Planning

```bash
bash pty:true background:true command:"il plan --yolo --print --json-stream 'Description of work to plan'"
# Monitor: process action:poll sessionId:XXX
# Full log: process action:log sessionId:XXX
```

- `--yolo`: autonomous mode (**requires a prompt argument or issue identifier**)
- `--print`: headless output
- `--json-stream`: stream JSONL incrementally (visible via poll/log)
- `background:true`: **required** — planning sessions can run 3-10+ minutes

### Non-Interactive Commit

```bash
bash pty:true background:true command:"il commit --no-review --json-stream"
# Monitor: process action:poll sessionId:XXX
```

- `--no-review`: skip message review
- `--json`: structured output (also implies `--no-review`)
- `--json-stream`: stream progress (Claude generates commit message)

### Non-Interactive Rebase

```bash
bash pty:true background:true command:"il rebase --force --json-stream"
# Monitor: process action:poll sessionId:XXX
```

- `--force`: force rebase even in edge cases
- `--json-stream`: stream progress (Claude assists with conflict resolution if needed)

### Quick Cleanup

```bash
bash pty:true command:"il cleanup --issue <number> --force --json"
```

- `--force`: skip confirmation
- `--json`: structured output

---

## JSON Output Commands

Commands that support `--json` for machine-parseable output:

| Command | JSON Flag | Notes |
|---------|-----------|-------|
| `il start` | `--json` | Returns workspace metadata |
| `il finish` | `--json-stream` | Stream progress (mutually exclusive with `--json`) |
| `il cleanup` | `--json` | Returns cleanup results |
| `il list` | `--json` | Returns array of loom objects |
| `il commit` | `--json-stream` | Stream progress (mutually exclusive with `--json`, implies `--no-review`) |
| `il issues` | `--json` | Returns array of issues/PRs |
| `il add-issue` | `--json` | Returns created issue |
| `il enhance` | `--json` | Returns enhancement result |
| `il summary` | `--json` | Returns summary text and metadata |
| `il recap` | `--json` | Returns recap data |
| `il dev-server` | `--json` | Returns server status |
| `il projects` | `--json` | Returns project list |
| `il rebase` | `--json-stream` | Stream progress during rebase |
| `il plan` | `--json` | Returns planning result (requires `--print`) |
| `il spin` | `--json` | Returns result (requires `--print`) |

---

## Auto-Notify on Completion

For long-running background tasks, append a wake trigger so OpenClaw gets notified when iloom finishes:

```bash
bash pty:true background:true command:"il start 42 --yolo --no-code --json && openclaw system event --text 'Done: Loom created for issue #42' --mode now"
```

This triggers an immediate wake event instead of waiting for the next heartbeat.

---

## Error Handling

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | General error |
| `130` | User aborted (e.g., Ctrl+C during commit review) |

### JSON Error Format

When `--json` is used and a command fails:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

### Fallback: process action:submit

If a command hits an unexpected prompt that can't be bypassed with flags, use `process action:submit` to send input:

```bash
# If a command unexpectedly asks for confirmation
process action:submit sessionId:XXX data:"y"

# If it asks for text input
process action:submit sessionId:XXX data:"some value"
```

This should be rare — the flag combinations above cover all known interactive prompts. If you encounter an undocumented prompt, submit a reasonable default and note it for future reference.
