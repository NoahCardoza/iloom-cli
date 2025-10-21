# Hatchbox AI Settings

This directory contains configuration files for Hatchbox AI workflows.

## settings.json

The `settings.json` file allows you to customize Hatchbox AI's behavior for your project.

### Configuration Options

#### mainBranch (optional)
Specifies the name of your main/primary branch. This is used by Hatchbox to determine where to merge completed work.

**Default**: If not specified, Hatchbox will try to detect it automatically by looking for a "main" branch or using the first worktree found.

**Example**:
```json
{
  "mainBranch": "main"
}
```

#### workflows (optional)
Configure per-workflow permission modes for Claude CLI. This allows you to control how Claude interacts with your code in different workflow contexts.

**Available workflow types**:
- `issue` - When working on GitHub issues (using `hb start <issue-number>`)
- `pr` - When working on pull requests (using `hb start <pr-number>`)
- `regular` - When working on regular branches (using `hb start <branch-name>`)

**Available permission modes**:
- `plan` - Claude will create a plan and ask for approval before making changes
- `acceptEdits` - Claude will make changes but wait for you to accept each edit
- `bypassPermissions` - Claude will make changes directly without asking (requires `--dangerously-skip-permissions` flag in Claude CLI)
- `default` - Use Claude CLI's default permission behavior (no flags passed)

**Example**:
```json
{
  "workflows": {
    "issue": {
      "permissionMode": "acceptEdits"
    },
    "pr": {
      "permissionMode": "plan"
    },
    "regular": {
      "permissionMode": "bypassPermissions"
    }
  }
}
```

**Use cases**:
- **`plan` mode for PRs**: When reviewing someone else's PR, you might want Claude to plan changes carefully before executing
- **`acceptEdits` mode for issues**: When implementing new features, you might want Claude to suggest changes but let you review each one
- **`bypassPermissions` mode for regular work**: For your own branches where you trust Claude to work autonomously
- **`default` mode**: When you want standard Claude CLI behavior without any special permissions

#### agents (optional)
Configure Claude model preferences for different agent types. This allows you to use more powerful or faster models depending on the task.

**Available models**:
- `sonnet` - Balanced performance and speed (default)
- `opus` - Most capable model for complex tasks
- `haiku` - Fastest model for simple tasks

**Example**:
```json
{
  "agents": {
    "code-reviewer": {
      "model": "opus"
    },
    "quick-fixes": {
      "model": "haiku"
    },
    "default": {
      "model": "sonnet"
    }
  }
}
```

### Complete Example

Here's a complete example showing all available options:

```json
{
  "mainBranch": "main",
  "workflows": {
    "issue": {
      "permissionMode": "acceptEdits"
    },
    "pr": {
      "permissionMode": "plan"
    },
    "regular": {
      "permissionMode": "bypassPermissions"
    }
  },
  "agents": {
    "code-reviewer": {
      "model": "opus"
    },
    "quick-fixes": {
      "model": "haiku"
    },
    "default": {
      "model": "sonnet"
    }
  }
}
```

### Minimal Example

All fields are optional. You can start with an empty configuration and add settings as needed:

```json
{}
```

Or just configure the settings you need:

```json
{
  "mainBranch": "develop"
}
```

### Validation

The settings file is validated when loaded. Common validation errors:

- **Invalid permission mode**: Must be one of `plan`, `acceptEdits`, `bypassPermissions`, or `default`
- **Invalid model**: Must be one of `sonnet`, `opus`, or `haiku`
- **Empty mainBranch**: If provided, mainBranch cannot be an empty string
- **Invalid JSON**: The file must be valid JSON syntax

### Notes

- All settings are optional - Hatchbox will use sensible defaults if settings are not provided
- Settings are loaded from `<project-root>/.hatchbox/settings.json`
- If the file doesn't exist, Hatchbox will use default behavior without error
- Changes to settings take effect the next time you run a Hatchbox command
