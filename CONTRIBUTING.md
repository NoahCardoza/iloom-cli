# Contributing to iloom

Thank you for your interest in contributing to iloom! This guide will help you get started with contributing to the project, whether you're fixing a bug, adding a feature, or improving documentation.

We welcome all types of contributions and are committed to making the contribution process as smooth and transparent as possible. By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Quick Start with `iloom contribute`

The fastest way to get started as a contributor is using the automated setup command:

```bash
iloom contribute # requires the github CLI (gh)
```

This command automates the entire contributor onboarding process:
- Creates a fork of the iloom-cli repository (if you don't have one)
- Clones your fork to your local machine
- Configures the upstream remote to track the main repository
- Sets up contributor-specific settings (github-pr mode for pull request workflow)

**Next steps after running `iloom contribute`:**
1. `cd` into the cloned directory
2. Run `pnpm install` to install dependencies
3. Find a `starter-task` issue to work on (see below)
4. Run `iloom start <issue-number>` to begin working

## Finding Your First Issue

We use the **`starter-task`** label to mark issues that are perfect for new contributors. These issues serve a dual purpose:

1. **Meaningful contributions**: They're real issues that need to be fixed or features to be added
2. **Learning the iloom workflow**: They help you understand how iloom's workspace isolation, AI analysis, and automated validation work

**Find starter-task issues here:**
https://github.com/iloom-ai/iloom-cli/labels/starter-task

Don't hesitate to ask questions on any issue! If you're interested in working on a `starter-task` but need clarification or guidance, just comment on the issue. We're here to help you succeed.

## Development Setup (Manual)

If you prefer manual setup or already have a fork:

### Prerequisites

- **Node.js**: Version 16.0.0 or higher
- **pnpm**: Package manager (not npm or yarn)
- **Git**: Version 2.5.0 or higher (for worktree support)
- **GitHub CLI** (`gh`): Required for issue/PR management

### Manual Setup Steps

1. **Fork the repository** on GitHub
2. **Clone your fork:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/iloom-cli.git
   cd iloom-cli
   ```
3. **Add upstream remote:**
   ```bash
   git remote add upstream https://github.com/iloom-ai/iloom-cli.git
   ```
4. **Install dependencies:**
   ```bash
   pnpm install
   ```
5. **Configure iloom settings** by creating `.iloom/settings.local.json`:
   ```json
   {
     "issueManagement": {
       "github": {
         "remote": "upstream"
       }
     },
     "mergeBehavior": {
       "mode": "github-pr"
     }
   }
   ```

## Development Workflow

### Starting Work on an Issue

Once you've found an issue to work on, use iloom's workspace isolation feature:

```bash
iloom start <issue-number>
```

This command:
- Creates an isolated Git worktree for the issue
- Checks out a new branch with a sanitized name
- Analyzes the issue using AI (complexity assessment, implementation planning)
- Sets up environment variables (unique port: 3000 + issue number)
- Creates isolated database branches (if configured with Neon)

**Benefits of workspace isolation:**
- Work on multiple issues simultaneously without context switching
- Each workspace has its own dependencies, build artifacts, and dev server
- No risk of mixing changes between different features/fixes

### Making Changes

When implementing your solution, follow these key principles:

**Test-Driven Development (TDD):**
- Write tests BEFORE implementing functionality
- Aim for >70% code coverage (this is enforced by CI)
- Use behavior-focused testing (test the "what", not the "how")

**Error Handling:**
- Throw exceptions for error conditions - do NOT swallow errors
- Do NOT use `CommandResult` objects with `success: true | false`
- When catching exceptions, be specific about which errors you're handling
- Check for expected error class, message, or code before re-throwing or handling

**Package Manager:**
- Always use `pnpm` (not npm or yarn)
- Update `package.json` if adding new dependencies

**Build After Major Changes:**
- Run `pnpm build` after implementing features or making significant changes
- This catches TypeScript compilation errors early
- Makes new functionality available for immediate testing

**Documentation:**
- Update README.md when adding new CLI commands, configuration options, or features
- Keep documentation synchronized with code changes

For complete development guidelines, see [CLAUDE.md](CLAUDE.md).

### Testing Your Changes

Before submitting a pull request, ensure all tests pass and code quality checks succeed:

```bash
# Run all tests
pnpm test

# Run tests in watch mode during development
pnpm test:watch

# Check code coverage (must be >70%)
pnpm test:coverage

# Run type checking
pnpm typecheck

# Run linter
pnpm lint

# Auto-fix linting issues
pnpm lint:fix

# Run all validation checks (typecheck + lint + test)
pnpm validate:commit
```

**Testing Requirements:**
- All new code must have corresponding tests
- Minimum 70% code coverage is required
- Tests should focus on behavior and contracts, not implementation details
- Mock external dependencies (Git, GitHub CLI, file system, shell commands)
- Avoid testing exact API call sequences or method invocation order

**Key Testing Principles:**
- Test the "what" (expected results), not the "how" (internal implementation)
- Use parameterized tests for similar scenarios
- Mock at boundaries (external APIs, file system) but not internal details
- Focus on public contracts and side effects that matter to consumers

See [CLAUDE.md](CLAUDE.md) for comprehensive testing guidelines and mock factory patterns.

### Finishing Your Work

When your implementation is complete and all tests pass:

```bash
iloom finish
```

This command:
- Validates your changes (typecheck, lint, test)
- Offers AI-assisted error fixing if validation fails
- Creates a pull request automatically (in `github-pr` mode)
- Runs the complete merge workflow
- Cleans up the workspace when done

For contributors, the `github-pr` mode (configured by `iloom contribute`) will create a pull request to the upstream repository rather than attempting a direct merge.

## Pull Request Process

### Creating a Pull Request

If using `iloom finish`, the PR is created automatically with:
- Issue reference in title
- Implementation summary in description
- Link to related issue

If creating manually, ensure your PR:
- Has a clear, descriptive title
- References the issue number (e.g., "Fixes #123")
- Includes a summary of changes
- Describes any breaking changes
- Documents testing performed

### Review Process

1. **Automated CI Checks**: Your PR must pass all CI checks:
   - TypeScript compilation (`pnpm build`)
   - Type checking (`pnpm typecheck`)
   - Linting (`pnpm lint`)
   - Tests with >70% coverage (`pnpm test`)

2. **Code Review**: A maintainer will review your code for:
   - Correctness and completeness
   - Adherence to project patterns and guidelines
   - Test coverage and quality
   - Documentation updates

3. **Feedback & Iteration**: Address any review feedback by pushing new commits to your PR branch

4. **Merge**: Once approved and all checks pass, a maintainer will merge your PR

### Commit Message Guidelines

- Use clear, descriptive commit messages
- Reference issue numbers when relevant
- **Do NOT include Claude or AI attribution** in commit messages (per project guidelines)

Example:
```
Add database branch isolation for Neon provider

Implements workspace-specific database branches using Neon's branching API.
Each workspace gets an isolated copy of the schema and data.

Fixes #123
```

## Code Quality Standards

### TypeScript

- All code must be written in TypeScript
- No implicit `any` types
- Use strict type checking
- Export types and interfaces where appropriate

### Architecture Patterns

The codebase follows these key patterns:

- **Dependency Injection**: Core classes accept dependencies via constructor
- **Provider Pattern**: Integrations implement provider interfaces (e.g., `DatabaseProvider`)
- **Command Pattern**: CLI commands are separate classes with clear responsibilities
- **Mock-First Testing**: All external dependencies are mocked in tests

### Error Handling

**Critical**: Do NOT swallow errors or use result objects with success flags.

```typescript
// ❌ BAD: Swallows errors
try {
  await doSomething()
  return { success: true }
} catch {
  return { success: false }
}

// ✅ GOOD: Throws exceptions
async function doSomething(): Promise<void> {
  // Implementation that throws on error
}

// ✅ GOOD: Specific error handling
try {
  await doSomething()
} catch (error) {
  if (error instanceof SpecificError && error.message.includes('expected pattern')) {
    // Handle specific expected error
  }
  // Re-throw unexpected errors
  throw error
}
```

### Documentation Requirements

When adding features or configuration, **you MUST update README.md**:

- **New CLI commands**: Add to command reference with usage examples
- **New configuration options**: Document in configuration section with defaults
- **New environment variables**: Add to environment variables section
- **New flags or options**: Update relevant command documentation
- **Breaking changes**: Clearly mark and explain migration steps

The README.md is the primary user-facing documentation.

## Project Architecture (Brief)

### Core Structure

```
src/
├── cli.ts                    # Main CLI entry point
├── commands/                 # CLI command implementations
│   ├── start.ts             # Workspace creation
│   ├── finish.ts            # Merge and cleanup
│   ├── cleanup.ts           # Manual cleanup
│   └── contribute.ts        # Contributor onboarding
├── lib/                     # Core business logic
│   ├── WorkspaceManager.ts  # Main orchestrator
│   ├── GitWorktreeManager.ts # Git operations
│   ├── GitHubService.ts     # GitHub CLI integration
│   └── EnvironmentManager.ts # .env file manipulation
└── utils/                   # Utility functions
```

### Bash-to-TypeScript Migration

The iloom TypeScript implementation maintains functional parity with the original bash scripts:
- `bash/new-branch-workflow.sh` → `StartCommand`
- `bash/merge-and-clean.sh` → `FinishCommand`
- `bash/cleanup-worktree.sh` → `CleanupCommand`

Understanding this evolution helps explain why certain patterns exist in the codebase. The TypeScript version adds comprehensive testing, type safety, and improved error handling while preserving the proven workflows from the bash implementation.

For detailed architecture documentation, see [CLAUDE.md](CLAUDE.md).

## Getting Help

### Where to Ask Questions

- **GitHub Issues**: Comment on the issue you're working on
- **GitHub Discussions**: For general questions about the project (when available)
- **Starter Tasks**: Don't hesitate to request help on `starter-task` issues

### When to Ask for Help

We encourage you to ask questions rather than getting stuck:

- If issue requirements are unclear
- If you're not sure about the best approach
- If tests are failing and you can't determine why
- If you encounter unexpected errors or behavior
- If you need clarification on project patterns or guidelines

The maintainers are here to help you succeed with your contribution!

## License

By contributing to iloom, you agree that your contributions will be licensed under the [Business Source License 1.1 (BUSL-1.1)](LICENSE).

The BUSL-1.1 license allows for free use, modification, and distribution for non-production purposes, with production use requiring a commercial license. See the [LICENSE](LICENSE) file for complete details.

---

Thank you for contributing to iloom! Your contributions help make this tool better for everyone.
