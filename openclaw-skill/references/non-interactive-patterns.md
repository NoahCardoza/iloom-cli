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

These commands launch Claude Code and run for extended periods:

| Command | Recommended Invocation |
|---------|----------------------|
| `il start` | `bash pty:true background:true command:"il start 42 --yolo --no-code --json"` |
| `il spin` | `bash pty:true background:true command:"il spin --yolo"` |
| `il plan` | `bash pty:true background:true command:"il plan --yolo"` |

### Foreground Commands (no `background:true`)

These commands complete quickly and return structured output:

| Command | Recommended Invocation |
|---------|----------------------|
| `il list` | `bash pty:true command:"il list --json"` |
| `il commit` | `bash pty:true command:"il commit --no-review --json"` |
| `il finish` | `bash pty:true command:"il finish --force --cleanup --no-browser --json"` |
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
| `il init` | Interactive wizard, must run foreground |
| `il rebase` | May need Claude for conflict resolution |
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

# 6. Terminate if needed
process action:kill sessionId:XXX
```

---

## Decision Bypass Map

Every interactive prompt in iloom and the flag(s) that bypass it:

| Command | Prompt | Bypass Flag(s) |
|---------|--------|---------------|
| `start` | "Enter issue number..." | Provide `[identifier]` argument |
| `start` | "Create as a child loom?" | `--child-loom` or `--no-child-loom` |
| `start` | "bypassPermissions warning" | Already implied by `--yolo`; or `--no-claude` |
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
bash pty:true background:true command:"il start <issue> --yolo --no-code --json"
```

- `--yolo`: bypass all permission prompts
- `--no-code`: don't open VS Code
- `--json`: structured output

### Full Autonomous Finish (merge and cleanup)

```bash
bash pty:true command:"il finish --force --cleanup --no-browser --json"
```

- `--force`: skip all confirmations
- `--cleanup`: auto-cleanup worktree
- `--no-browser`: don't open browser
- `--json`: structured output

### Headless Planning

```bash
bash pty:true command:"il plan --yolo --print --output-format json"
```

- `--yolo`: autonomous mode
- `--print`: headless output
- `--output-format json`: structured JSON response

### Non-Interactive Commit

```bash
bash pty:true command:"il commit --no-review --json"
```

- `--no-review`: skip message review
- `--json`: structured output (also implies `--no-review`)

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
| `il finish` | `--json` | Returns operation results |
| `il cleanup` | `--json` | Returns cleanup results |
| `il list` | `--json` | Returns array of loom objects |
| `il commit` | `--json` | Returns commit details (implies `--no-review`) |
| `il issues` | `--json` | Returns array of issues/PRs |
| `il add-issue` | `--json` | Returns created issue |
| `il enhance` | `--json` | Returns enhancement result |
| `il summary` | `--json` | Returns summary text and metadata |
| `il recap` | `--json` | Returns recap data |
| `il dev-server` | `--json` | Returns server status |
| `il projects` | `--json` | Returns project list |
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
