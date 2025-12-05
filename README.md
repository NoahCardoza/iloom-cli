iloom
=====
<div align="center">

[![npm](https://img.shields.io/npm/v/%40iloom%2Fcli?label=npm)](https://www.npmjs.com/package/@iloom/cli)
[![License: BSL-1.1](https://img.shields.io/badge/license-BSL--1.1-lightgrey)](https://raw.githubusercontent.com/iloom-ai/iloom-cli/main/LICENSE)
[![Built for Claude Code](https://img.shields.io/badge/built%20for-claude%20code-8A6FFF)](https://claude.ai/)
[![CI](https://github.com/iloom-ai/iloom-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/iloom-ai/iloom-cli/actions/workflows/ci.yml)

</div>

<div align="center">
  <img width="600" alt="iloom-ai-screenshot" src="https://raw.githubusercontent.com/iloom-ai/iloom-cli/main/assets/iloom-screenshot.png" />
  <div>iloom in action: Scale understanding, not just output.</div>
</div>

#### Links to key sections

[How It Works](#how-it-works-the-multi-agent-workflow) • [Installation](#quick-start) • [Configuration](#configuration) • [Advanced Features](#advanced-features) • [Limitations](#system-requirements--limitations)

## Built For Modern Tools...

[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Neon](https://img.shields.io/badge/Neon-00E699?style=for-the-badge)](https://neon.tech/)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-8A6FFF?style=for-the-badge)](https://claude.ai/)

...To Solve A Very Modern Problem
---------------------------------

The promise of AI-assisted development is profound: write more code, ship features faster. But there is a hidden cost. **AI agents write code quickly, but they struggle to stay in sync with their humans.**

The hard part isn't generating code, it's maintaining the shared mental model of _why_ that code exists. When you rely on ephemeral chat windows, friction piles up:

*   You constantly re-brief the AI on the same context.
    
*   Hidden assumptions creep in (e.g., "Why did it use Axios instead of fetch?").
    
*   You spend more time reviewing and "babysitting" the AI than building.
    

**The bottleneck isn't output velocity. It's maintaining alignment between human and AI at scale.**

### The iloom Approach: Context as Infrastructure

iloom stops the "Context Window Tetris." It treats context as a first-class concern, persisting your AI's reasoning in **issue comments** rather than temporary chats.

*   **Stop Babysitting, Start Collaborating:** Instead of arguing with Claude in a chat, you review structured analysis plans in your issue tracker _before_ a single line of code is written.
    
*   **Scale Understanding:** Because every loom holds its own isolated environment (Git worktree, DB branch, local server), you can switch between 5 complex features without losing your place or your AI's context.
    
*   **Visible Reasoning:** The AI's decisions are documented publicly. Your team sees the plan, and "future you" knows exactly why a decision was made.
    

_iloom is not just a tool for managing git worktrees - it's a control plane for maintaining alignment between you and your AI assistant._

Quick Start
-----------

iloom uses your existing Claude subscription to build a shared mental model of your task.
```bash
 # 1. Install iloom
 npm install -g @iloom/cli
 
 # 2. Authenticate (iloom uses the GitHub CLI) 
 gh auth login 
 
 # 3. Start a Loom 
 # Spins up an isolated environment (Git worktree, DB branch, unique port).
 # Analyzes the issue, plans the work, and documents the plan in issue comments.
 il start 25 

 # ... You, the iloom agents and Claude build the feature together in the isolated environment ...
 
 # 4. Finish & Merge  # Validates code (test/lint), handles merge conflicts, and cleans up the worktree/DB.
 il finish 
 ```

**The iloom Difference:** il start doesn't just create a branch. It launches a multi-agent workflow that surfaces assumptions and creates a structured plan in your issue tracker **before you even need to look at your IDE.**

**→ [Want to know how you'll benefit from iloom?](docs/is-iloom-right-for-you.md)**

How It Works: The Multi-Agent Workflow
--------------------------------------

When you run il start, iloom orchestrates specialized AI agents. Each has a specific role and writes structured output to **issue comments**, creating permanent project knowledge.

### 1. The Agents

Instead of a single generic prompt, iloom uses a pipeline of agents:

*   **Enhancer (iloom-issue-enhancer):** Expands brief one-liners into detailed requirements.
    
*   **Evaluator (iloom-issue-complexity-evaluator):** Determines the workflow approach:
    
    *   **Simple:** Combines analysis and planning into one step for efficiency.
        
    *   **Complex:** Separates deep root-cause analysis from detailed implementation planning.
        
*   **Implementer:** Executes the plan using the context established in the previous steps.
    

### 2\ Interactive Control

You are in the loop at every stage. You can review the AI's analysis, edit the plan in GitHub/Linear, and adjust course before implementation begins.

*   **Default Mode:** You approve each phase (Enhance → Plan → Implement).
    
*   **--one-shot Mode:** Feeling lucky? Automate the entire pipeline from start to finish without prompts.
    

### 3. The Environment

Each loom is a fully isolated container for your work:

*   **Git Worktree:** A separate filesystem at ~/project-looms/issue-25/. No stashing, no branch switching overhead.
    
*   **Database Branch:** (Neon support) Schema changes in this loom are isolated—they won't break your main environment or your other active looms.

*   **Environment Variables:** Each loom has its own environment files (`.env`, `.env.local`, `.env.development`, `.env.development.local`). Uses `development` by default, override with `DOTENV_FLOW_NODE_ENV`.

*   **Unique Runtime:**
    
    *   **Web Apps:** Runs on a deterministic port (e.g., base port 3000 + issue #25 = 3025).
        
    *   **CLI Tools:** Creates an isolated binary copy (e.g., my-tool-25). You can run issue #25's version of your CLI alongside issue #99's version without conflicts. (Fun fact: iloom was built with iloom using this feature).
        
*   **Context Persistence:** All reasoning is stored in issue comments. This makes the "why" behind the code visible to your teammates and your future self.
    

Command Reference
-----------------

| **Command** | **Alias** |  **Description** |
| ------ | ----- | -----|
| `il start` | `new` | Create loom, run analysis agents, and launch IDE. |
| `il finish` | `dn` | Validate tests/lint, commit, handle conflicts, and merge/PR. |
| `il cleanup` | `remove` | Safely remove a loom and its database branch without merging. |
| `il list` |  | Show active looms and paths. |
| `il spin` |  | Launch Claude inside the current loom with context auto-detected. |
| `il open` | `run` | Open loom in browser (web) or run your CLI tool. |
| `il add-issue` | `a` | Create and AI-enhance a new issue without starting work yet. |
| `il init` | `config` | Interactive configuration wizard. |
| `il feedback` | `f` | Submit bug reports/feedback directly from the CLI. |
| `il update` |  | Update iloom CLI to the latest version. |

For detailed documentation including all command options, flags, and examples, see the [Complete Command Reference](docs/iloom-commands.md).

Configuration
-------------

### 1. Interactive Setup (Recommended)

The easiest way to configure iloom is the interactive wizard. It guides you through setting up your environment (GitHub/Linear, Neon, IDE).

You can even use natural language to jump-start the process:

```bash
# Standard wizard
il init 

# Natural language wizard
il init "set my IDE to windsurf and help me configure linear"
```   

### 2. Manual Configuration

Settings are loaded in this order (highest priority first):

1.  **CLI Flags:** il start --permissionMode=acceptEdits
    
2.  **Local Overrides:** .iloom/settings.local.json (gitignored; for API keys & local preferences)
    
3.  **Project Settings:** .iloom/settings.json (committed; for shared team defaults)
    
4.  **Global Settings:** ~/.config/iloom-ai/settings.json (for user-specific defaults)
    

### Key Settings Example

This example shows how to configure a project-wide default (e.g., GitHub remote) while keeping sensitive keys (Linear API token) or personal preferences (IDE choice) local.

**.iloom/settings.json (Committed)**

```json
{
  "mainBranch": "main",
  "issueManagement": {
    "provider": "github"
  },
  "capabilities": {
    "web": {
      "basePort": 3000
    },
    "database": {
      "databaseUrlEnvVarName": "DATABASE_URL"
    }
  },
  "databaseProviders": {
    "neon": {
      "projectId": "fantastic-fox-3566354"
    }
  }
}
```

**.iloom/settings.local.json (Gitignored)**

```json
{
  "issueManagement": {
    "linear": {
      "apiToken": "lin_api_..." // Only if using Linear
    }
  },
  "workflows": {
    "issue": {
      "permissionMode": "acceptEdits" // Control Claude Code permissions
    }
  }
}
```

Integrations
------------

### Issue Trackers

iloom supports the tools you already use. Unless you use JIRA.

| **Provider** | **Setup** | **Notes** |
|--------------|-----------|-----------|
| **GitHub**   | `gh auth login` | Default. Supports Issues and Pull Requests automatically. |
| **Linear**   | `il init` | Requires API token. Supports full read/write on Linear issues. |


### IDE Support
iloom creates isolated workspace settings for your editor. Color synchronization (visual context) only works best VS Code-based editors.

*   **Supported:** VS Code, Cursor, Windsurf, Antigravity, WebStorm, IntelliJ, Sublime Text.
    
*   **Config:** Set your preference via `il init` or `il start --set ide.type=cursor`.
    

Advanced Features
-----------------

### Child Looms (Nested Contexts)

Sometimes a task spawns sub-tasks, or you get interrupted by an urgent bug while deep in a feature. Child looms let you create a workspace _within_ a workspace.

**When to use:**

*   Breaking down a massive feature into smaller PRs.
    
*   Fixing a bug discovered during feature work without losing context.
    

**How it works:** If you run il start 42 while inside loom-25, iloom asks if you want to create a child loom.

*  **Inheritance:** The child inherits the database state and git branch from the parent (not main).
    
*  **Structure**
```
    ~/my-project-looms/
    ├── feat-issue-25-auth/           # Parent Loom
    └── feat-issue-25-auth-looms/     # Child Looms Directory
      ├── fix-issue-42-bug/         # Child Loom (inherits from #25)
      └── feat-issue-43-subtask/    # Another Child Loom
```

### CLI Tool Development

iloom provides first-class support for building CLI tools. When you start a loom for a CLI project, iloom creates workspace-specific binaries so you can test each issue's version independently.


```bash
> il start 52 # Working on CLI feature in issue 52 

> my-cli-52 --version  # Test issue 52's version 

> il start 137  # Switch to different CLI issue

> my-cli-137 --help    # Test issue 137's version

# Original binary still works from main branch
> my-cli --version     # Unaffected by other looms' CLIs
```

System Requirements & Limitations
---------------------------------

This is an early-stage product.

**Requirements:**

*   ✅ **OS:** macOS (Fully supported). ⚠️ Linux/Windows are untested.
    
*   ✅ **Runtime:** Node.js 16+, Git 2.5+.
    
*   ✅ **AI:** Claude CLI installed. A Claude Max subscription is recommended (iloom uses your subscription).
    

**Project Support:**

*   ✅ **Node.js Web Projects:** First-class support via package.json scripts (dev, test, build).
    
*   ✅ **Node.js CLI Tools:** Full support with isolated binary generation.
    
*   ⚠️ **Other Stacks:** Python/Go/Rust etc. can work via generic package.json scripts, but are not natively supported yet.    

See all [known limitations](https://github.com/iloom-ai/iloom-cli/issues?q=is:issue+is:open+label:known-limitation) on GitHub. If you're feeling left out - you're absolutely right! The best way to complain about something is to fix it. So...

Contributing
------------

We (Claude and I) welcome contributions! We've made it easy to get started — iloom can even set up its own dev environment.

```bash
iloom contribute   # Handles forking, cloning, and setting up the dev environment automatically.
```

New contributors should start with issues labeled [starter-task](https://github.com/iloom-ai/iloom-cli/issues?q=is%3Aissue+is%3Aopen+label%3Astarter-task). For details, see our [Contributing Guide](CONTRIBUTING.md).

License & Name
--------------

**iloom** comes from "illuminate" (illuminating the AI coding process) and "intelligent loom" (weaving artificial and human intelligence together).

**License: Business Source License 1.1**

*   ✅ Free to use for any internal or commercial project.
    
*   ❌ You cannot resell iloom itself as a product or SaaS.
    
*   Converts to Apache 2.0 on 2029-01-01.
    

See [LICENSE](https://raw.githubusercontent.com/iloom-ai/iloom-cli/main/LICENSE) for complete terms.