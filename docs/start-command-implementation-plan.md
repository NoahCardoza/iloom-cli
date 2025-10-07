# Start Command Implementation Plan

## Overview

This document outlines the plan to implement issue #6 - the `start` command for hatchbox-ai. The original issue is too large to implement as a single task, so we're breaking it down into 8 manageable sub-issues that can be developed and tested independently.

## Goal

Port the functionality of `bash/new-branch-workflow.sh` into a robust, testable TypeScript implementation that maintains feature parity while adding improved error handling, testing, and modularity.

## Implementation Strategy

### Phased Approach
We'll implement the command in phases, with each sub-issue building upon the previous work while remaining independently testable and mergeable. This allows us to:
- Use the tool to develop itself as early as possible
- Maintain a working state between each phase
- Get incremental feedback and validation
- Reduce complexity and cognitive load

### Test-Driven Development
Each sub-issue must follow TDD principles:
- Write tests first
- Achieve >95% code coverage
- Create comprehensive mock factories
- Include unit, integration, and edge case tests

## Sub-Issues Breakdown

### Sub-Issue #1: Core Start Command Structure & Input Validation

**Title**: Implement basic structure and input validation for start command

**Description**:
Create the foundational structure for the `start` command with robust input parsing and validation.

**Scope**:
- Create `src/commands/start.ts` with command class structure
- Implement argument parsing for various input formats:
  - Plain numbers: `hb start 123` (will auto-detect if issue or PR)
  - Explicit PR format (optional): `hb start pr/456` or `hb start PR-456`
  - Branch names: `hb start feature/my-branch`
- Add basic input pattern detection:
  - Numeric patterns for GitHub entities
  - Branch name patterns for direct branch creation
- Implement basic validation rules:
  - Valid number format for issue/PR
  - Valid branch name characters
  - Required vs optional arguments
- Create error handling framework with clear user messages
- Set up command registration in CLI

**Files to Create/Modify**:
- `src/commands/start.ts`
- `src/commands/index.ts`
- `tests/commands/start.test.ts`

**Testing Requirements**:
- Unit tests for input parsing logic
- Tests for pattern matching (numeric vs branch)
- Error case tests (invalid inputs, missing args)
- Command registration tests

**Acceptance Criteria**:
- [ ] Command accepts plain numbers for GitHub detection
- [ ] Command accepts branch names for direct creation
- [ ] Input validation provides clear error messages
- [ ] Command structure follows established patterns
- [ ] 95%+ test coverage
- [ ] Command appears in CLI help

**Dependencies**: None (can start immediately)

---

### Sub-Issue #2: GitHub Integration for Start Command

**Title**: Integrate existing GitHub detection with start command

**Description**:
Connect the start command with the existing GitHubService detection capabilities to fetch issue/PR details and generate appropriate branch names.

**Scope**:
- Use existing `GitHubService.detectInputType()` method for smart detection
  - Already implements trying PR first, then issue (lines 52-78)
  - Returns `GitHubInputDetection` with type and number
- Use existing `GitHubService.fetchIssue()` and `GitHubService.fetchPR()` methods
- Use existing branch name generation with Claude integration
  - `GitHubService.generateBranchName()` already supports Claude strategy
- Validate issue/PR state using existing methods
- Check if branch already exists (local and remote)
- Handle GitHub API errors gracefully

**Existing Logic to Use**:
```typescript
// Already implemented in GitHubService (lines 52-78)
const detection = await gitHubService.detectInputType(input);
if (detection.type === 'issue') {
  const issue = await gitHubService.fetchIssue(detection.number);
  await gitHubService.validateIssueState(issue);
  const branch = await gitHubService.generateBranchName({
    issueNumber: issue.number,
    title: issue.title
  });
} else if (detection.type === 'pr') {
  const pr = await gitHubService.fetchPR(detection.number);
  await gitHubService.validatePRState(pr);
  // Use PR's existing branch
}
```

**Files to Create/Modify**:
- `src/commands/start.ts` (integrate with GitHubService)
- `tests/commands/start.test.ts` (test integration)
- Mock factories already exist in test-utils

**Testing Requirements**:
- Test integration with GitHubService methods
- Test handling of detection results
- Test error handling from GitHub API
- Test branch validation logic

**Acceptance Criteria**:
- [ ] Automatically detects if a number is an issue or PR
- [ ] Fetches correct data based on detection
- [ ] Validates state (closed issues, merged PRs)
- [ ] Generates appropriate branch names
- [ ] Handles GitHub API failures gracefully
- [ ] 95%+ test coverage

**Dependencies**: Sub-Issue #1 (command structure)

---

### Sub-Issue #2.5: HatchboxManager - Central Orchestrator

**Title**: Implement HatchboxManager as central orchestrator for workspace operations

**Description**:
Create the HatchboxManager class as the central orchestrator that coordinates between all service classes and provides a clean API for commands to use. This addresses the architectural gap identified during Issue #33 implementation.

**Scope**:
- Create orchestrator class that coordinates all workspace operations
- Manage lifecycle of workspaces (called "hatchboxes")
- Implement transaction management with rollback on failure
- Provide consistent error handling across operations
- Create clean API for commands (start, finish, cleanup) to use

**Architecture**:
```typescript
export class HatchboxManager {
  constructor(
    private gitWorktree: GitWorktreeManager,
    private github: GitHubService,
    private environment: EnvironmentManager,
    private claude: ClaudeContextManager,
    private database?: DatabaseManager
  ) {}

  async createHatchbox(input: CreateHatchboxInput): Promise<Hatchbox>
  async finishHatchbox(identifier: string): Promise<void>
  async cleanupHatchbox(identifier: string): Promise<void>
  async listHatchboxes(): Promise<Hatchbox[]>
  async findHatchbox(identifier: string): Promise<Hatchbox | null>
}
```

**Files to Create/Modify**:
- `src/lib/HatchboxManager.ts` (new - main orchestrator)
- `src/lib/HatchboxManager.test.ts` (new - comprehensive tests)
- `src/types/hatchbox.ts` (new - type definitions)
- `src/commands/start.ts` (update to use HatchboxManager)

**Testing Requirements**:
- Unit tests with mocked dependencies
- Integration tests for complete workflows
- Error recovery and rollback tests
- State transition tests
- Concurrent operation tests

**Acceptance Criteria**:
- [ ] HatchboxManager class with all core methods
- [ ] Comprehensive error handling and rollback
- [ ] Integration with existing services
- [ ] StartCommand updated to use HatchboxManager
- [ ] 95%+ test coverage
- [ ] Clear API documentation

**Dependencies**: Sub-Issue #1 (provides validated input), uses existing services from Issues #2, #3, #4, #12

**GitHub Issue**: #41

---

### Sub-Issue #3: Worktree Creation & Environment Setup

**Title**: Extend GitWorktreeManager and implement environment configuration

**Description**:
Extend GitWorktreeManager with sanitization logic and create isolated Git worktrees with proper environment setup for each issue/PR.

**Scope**:
- Add branch name sanitization method to `GitWorktreeManager`
- Use extended worktree creation with sanitized directory names
- Copy and modify `.env` files for the worktree using existing `EnvironmentManager`
- Use existing port calculation (3000 + issue/PR number) from `EnvironmentManager`
- Create shell utilities for dependency installation (`pnpm install`)
- Handle worktree conflicts and errors
- Implement cleanup on failure

**Key Logic to Port**:
```bash
# From new-branch-workflow.sh lines 568-624
sanitized_branch=$(echo "$branch" | tr '/' '-' | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g')
worktree_dir="$WORKTREE_BASE/$sanitized_branch"
git worktree add "$worktree_dir" "$branch"
cp .env "$worktree_dir/.env"
echo "PORT=$port" >> "$worktree_dir/.env"
```

**Files to Create/Modify**:
- `src/lib/GitWorktreeManager.ts` (extend with sanitization method)
- `src/utils/package-manager.ts` (create new - for pnpm install and dev commands)
- `tests/lib/GitWorktreeManager.test.ts`
- `tests/utils/package-manager.test.ts` (new)
- Use existing `EnvironmentManager` methods (no modifications needed)

**Testing Requirements**:
- Mock git worktree commands
- Test sanitization of branch names in GitWorktreeManager
- Test port calculation (already exists in EnvironmentManager)
- Test .env file manipulation (already exists in EnvironmentManager)
- Test package manager command execution
- Test rollback on failure
- Integration tests with temp directories

**Acceptance Criteria**:
- [ ] GitWorktreeManager includes sanitization method
- [ ] Creates worktrees with sanitized names
- [ ] Copies and modifies .env files correctly using EnvironmentManager
- [ ] Assigns unique ports using existing EnvironmentManager.calculatePort()
- [ ] Package manager utilities successfully run pnpm install
- [ ] Cleans up on failure
- [ ] Handles edge cases (spaces, special chars in names)
- [ ] 95%+ test coverage

**Dependencies**: Sub-Issue #2 (needs branch names from GitHub), Sub-Issue #2.5 (HatchboxManager for orchestration)

---

### Sub-Issue #4: Claude Integration & Context Generation

**Title**: Leverage existing Claude services for context generation

**Description**:
Use the existing ClaudeContextManager and ClaudeService to generate context files and launch Claude CLI.

**Scope**:
- Use existing `ClaudeContextManager` for context preparation
  - Note: `.claude-context.md` file not needed (bash scripts don't use it)
- Use existing `ClaudeService` for CLI launching
  - Already handles model selection and prompt management
- Use existing `PromptTemplateManager` for structured prompts
  - Already supports different prompts for issues vs PRs
- Integrate these services with the start command workflow
- Handle Claude CLI errors

**Existing Classes to Use**:
- `src/lib/ClaudeContextManager.ts` - Context file generation
- `src/lib/ClaudeService.ts` - Claude CLI integration
- `src/lib/PromptTemplateManager.ts` - Prompt template management
- `src/utils/claude.ts` - Claude utilities

**Files to Modify**:
- `src/commands/start.ts` (integrate Claude services)
- `tests/commands/start.test.ts` (test Claude integration)

**Testing Requirements**:
- Test integration with existing Claude services
- Test context file generation in worktree
- Test Claude CLI launch parameters
- Mock Claude CLI interactions
- Test error handling

**Acceptance Criteria**:
- [ ] Generates comprehensive context files using existing service
- [ ] Selects appropriate prompts based on detected type
- [ ] Launches Claude CLI with correct parameters
- [ ] Context includes all relevant workspace information
- [ ] Handles Claude CLI failures gracefully
- [ ] 95%+ test coverage

**Dependencies**: Sub-Issue #3 (needs worktree to be created)

---

### Sub-Issue #5: Visual Workspace Distinction

**Title**: Add terminal and VSCode color synchronization for visual workspace identification

**Description**:
Implement the visual distinction system that colors terminal backgrounds and VSCode title bars based on the workspace.

**Scope**:
- Create color generation algorithm (SHA256 hash of branch name)
- Define 10 predefined subtle RGB colors
- Implement terminal background coloring (cross-platform)
- Implement VSCode settings.json manipulation
- Ensure color consistency across terminal and VSCode

**Key Logic to Port**:
```bash
# From new-branch-workflow.sh lines 106-128
get_terminal_color() {
    local colors=(
        "40,30,30"  # Subtle red
        "30,40,30"  # Subtle green
        # ... 8 more colors
    )
    local hash=$(echo -n "$1" | sha256sum | cut -d' ' -f1)
    local index=$((0x${hash:0:2} % 10))
    echo "${colors[$index]}"
}
```

**Files to Create**:
- `src/lib/TerminalColorManager.ts`
- `src/lib/VSCodeIntegration.ts`
- `src/utils/color.ts`
- `tests/lib/TerminalColorManager.test.ts`
- `tests/lib/VSCodeIntegration.test.ts`

**Testing Requirements**:
- Test SHA256 hash generation
- Test color index calculation
- Test terminal escape sequence generation
- Test VSCode settings.json manipulation
- Test cross-platform compatibility
- Ensure deterministic color selection

**Acceptance Criteria**:
- [ ] Generates consistent colors for same branch name
- [ ] Applies terminal background colors
- [ ] Updates VSCode settings.json correctly
- [ ] Works on macOS, Linux, and Windows
- [ ] Colors are subtle and professional
- [ ] 95%+ test coverage

**Dependencies**: Sub-Issue #3 (needs worktree path)

---

### Sub-Issue #6: Multiple Opening Modes

**Title**: Implement flexible workspace opening modes (terminal, VSCode, dev server)

**Description**:
Add support for different ways to open the workspace based on developer workflow preferences.

**Scope**:
- Implement `-t, --terminal-only` flag (terminal with PORT, no Claude)
- Implement `-d, --dev-server` flag (VSCode + terminal with pnpm dev)
- Implement `-c, --code-only` flag (VSCode only)
- Implement `--complete` flag (dual windows: Claude + dev server)
- Add mode-specific launch sequences
- Handle terminal and VSCode launching

**Mode Matrix**:
| Mode | Terminal | Claude | VS Code | Dev Server |
|------|----------|--------|---------|------------|
| Default | ✓ | ✓ | - | - |
| `-t` | ✓ | - | - | - |
| `-d` | ✓ | - | ✓ | ✓ |
| `-c` | - | - | ✓ | - |
| `--complete` | ✓✓ | ✓ | ✓ | ✓ |

**Files to Modify**:
- `src/commands/start.ts` (add flag parsing and opening logic)
- `tests/commands/start.test.ts` (test flags and launch sequences)

**Testing Requirements**:
- Test flag parsing and validation
- Test each mode's launch sequence
- Test conflicting flags
- Mock terminal and VSCode launches
- Test dual-window timing for --complete

**Acceptance Criteria**:
- [ ] All 5 modes work as specified
- [ ] Flags are mutually exclusive where appropriate
- [ ] Launch sequences are correct for each mode
- [ ] --complete mode properly sequences dual windows
- [ ] Clear documentation of modes
- [ ] 95%+ test coverage

**Dependencies**: Sub-Issues #4 and #5 (needs Claude and visual features)

---

### Sub-Issue #7: Advanced Features & Polish

**Title**: Add interactive prompting, worktree reuse, and performance optimizations

**Description**:
Implement quality-of-life improvements and advanced features for better user experience.

**Scope**:
- Interactive input prompting when no arguments provided
- Check for existing worktree before creating new one
- Reuse existing worktrees (skip setup, just open)
- Use existing `GitHubService.moveIssueToInProgress()` method
  - Already implemented (lines 203-249)
- Performance optimizations (parallel operations where safe)
- Improved error messages and user feedback
- Progress indicators for long operations

**Key Features to Port**:
```bash
# From new-branch-workflow.sh lines 84-93
if [[ -z "$1" ]]; then
    echo "Enter issue number, PR number (pr/123), or branch name:"
    read -r input
fi

# Check for existing worktree
if git worktree list | grep -q "$worktree_dir"; then
    echo "Worktree already exists, opening..."
    # Skip setup, just open
fi
```

**Files to Modify**:
- `src/commands/start.ts` (add interactive mode and reuse logic)
- `src/lib/GitWorktreeManager.ts` (use existing findWorktreeForBranch for detection)
- Various files for performance improvements

**Testing Requirements**:
- Test interactive prompting
- Test existing worktree detection
- Test worktree reuse flow
- Test GitHub issue status updates
- Performance benchmarks
- Test progress indicators

**Acceptance Criteria**:
- [ ] Interactive mode works when no args provided
- [ ] Detects and reuses existing worktrees
- [ ] Updates GitHub issue status using existing method
- [ ] Performance meets or exceeds bash script
- [ ] Clear progress feedback for users
- [ ] 95%+ test coverage

**Dependencies**: All previous sub-issues

---

### Sub-Issue #8: Database Branch Management

**Title**: Implement database branching support for isolated development

**Description**:
Add support for creating isolated database branches per workspace using Neon CLI.

**Scope**:
- Extend existing `DatabaseManager` class
  - Already has provider abstraction in place
- Implement Neon CLI integration
- Create database branches named after issues
- Manage connection strings in .env files
- Support multiple database providers (Neon, Supabase, PlanetScale)
- Clean up database branches when finishing work
- Handle database operation failures

**Note**: This is deprioritized since hatchbox-ai itself doesn't use a database. Will be implemented after the tool is usable for its own development.

**Files to Create/Modify**:
- `src/lib/DatabaseManager.ts` (extend existing)
- `src/providers/NeonProvider.ts` (new)
- `src/utils/database.ts`
- `tests/lib/DatabaseManager.test.ts`
- `tests/mocks/MockNeonProvider.ts`

**Testing Requirements**:
- Mock Neon CLI commands
- Test branch creation and deletion
- Test connection string management
- Test provider abstraction
- Test error handling

**Acceptance Criteria**:
- [ ] Creates database branches successfully
- [ ] Updates .env with correct connection strings
- [ ] Cleans up branches on finish
- [ ] Handles database failures gracefully
- [ ] Provider pattern allows future extensions
- [ ] 95%+ test coverage

**Dependencies**: Can be implemented independently after core features

---

## Implementation Timeline

### Phase 1: Core Functionality (Week 1-2)
- Sub-Issue #1: Core Command Structure (2 days)
- Sub-Issue #2: GitHub Integration with Existing Services (2 days)
- Sub-Issue #3: Worktree Creation (3 days)

### Phase 2: Claude Integration (Week 2)
- Sub-Issue #4: Claude Context & Launching (2 days) - Using existing services

### Phase 3: Enhanced UX (Week 3)
- Sub-Issue #5: Visual Workspace Distinction (2 days)
- Sub-Issue #6: Multiple Opening Modes (2 days)

### Phase 4: Polish & Advanced Features (Week 4)
- Sub-Issue #7: Interactive Features & Optimization (3 days)

### Phase 5: Database Support (Future)
- Sub-Issue #8: Database Branching (3 days)

## Success Metrics

### Functional Requirements
- 100% feature parity with `new-branch-workflow.sh`
- All 8 sub-issues completed and tested
- Can be used to develop itself (dogfooding)
- Leverages all existing services effectively

### Quality Requirements
- >95% test coverage across all code
- Comprehensive mock factories for all external dependencies
- Performance within 10% of bash script
- Zero critical bugs in production

### User Experience
- Clear error messages and recovery paths
- Interactive prompting for better UX
- Visual distinction prevents confusion
- Multiple modes support different workflows
- Smart detection reduces cognitive load

## Risk Mitigation

### Technical Risks
1. **Cross-platform compatibility**: Mitigate with early testing on all platforms
2. **External CLI dependencies**: Comprehensive mocking and error handling
3. **Performance degradation**: Regular benchmarking against bash script

### Process Risks
1. **Scope creep**: Strict adherence to sub-issue boundaries
2. **Integration issues**: Each sub-issue must be independently mergeable
3. **Testing overhead**: Test-first development to prevent debt

## Definition of Done

The `start` command implementation is complete when:

1. All 8 sub-issues are implemented and merged
2. Full integration tests pass
3. Documentation is complete
4. Performance benchmarks are met
5. The tool can be used to develop itself
6. User feedback from dogfooding is incorporated
7. All acceptance criteria are met
8. All existing services are properly integrated

## Notes

- Each sub-issue should have its own PR
- Code review required for each PR
- Integration tests run after each merge
- Regular dogfooding to validate UX decisions
- Performance benchmarks tracked in CI
- Leverage existing services wherever possible (GitHubService, ClaudeService, etc.)

## Appendix: Existing Services to Leverage

### Already Implemented Services

```
src/lib/
├── GitHubService.ts        # Smart detection, issue/PR fetching, branch generation
├── GitWorktreeManager.ts   # Git worktree operations
├── EnvironmentManager.ts   # .env file management
├── ClaudeContextManager.ts # Context file generation
├── ClaudeService.ts        # Claude CLI integration
├── PromptTemplateManager.ts # Prompt template management
└── DatabaseManager.ts      # Database abstraction (ready for extension)

src/utils/
├── git.ts                  # Git utilities
├── github.ts               # GitHub CLI utilities
├── env.ts                  # Environment utilities
├── claude.ts               # Claude utilities
└── prompt.ts               # User prompting utilities
```

### Key Methods Already Available

- `GitHubService.detectInputType()` - Automatically detects issue vs PR
- `GitHubService.fetchIssue()` / `GitHubService.fetchPR()` - Fetches entities
- `GitHubService.generateBranchName()` - Generates branch names with Claude
- `GitHubService.moveIssueToInProgress()` - Updates project status
- `ClaudeContextManager.generateContext()` - Creates context files
- `ClaudeService.launchCLI()` - Launches Claude with parameters
- `PromptTemplateManager.getTemplate()` - Gets appropriate prompt template

## File Structure After Implementation

```
src/
├── commands/
│   └── start.ts                    # Main command implementation (orchestrator)
├── lib/
│   ├── GitWorktreeManager.ts       # Already exists, extend with sanitization
│   ├── GitHubService.ts           # Already has detection & fetching
│   ├── EnvironmentManager.ts      # Already exists with port calculation
│   ├── ClaudeContextManager.ts    # Already exists, ready to use
│   ├── ClaudeService.ts           # Already exists, ready to use
│   ├── PromptTemplateManager.ts   # Already exists, ready to use
│   ├── TerminalColorManager.ts    # New: Terminal coloring
│   ├── VSCodeIntegration.ts       # New: VSCode settings
│   └── DatabaseManager.ts         # Already exists, extend for Neon
├── providers/
│   └── NeonProvider.ts            # New: Neon CLI integration
├── utils/
│   ├── git.ts                     # Already exists
│   ├── github.ts                  # Already has detection logic
│   ├── env.ts                     # Already exists
│   ├── package-manager.ts         # New: pnpm commands
│   ├── claude.ts                  # Already exists
│   ├── color.ts                   # New: Color generation
│   └── database.ts                # New: Database utilities
└── prompts/                        # May already exist
    ├── issue-prompt.md
    ├── pr-prompt.md
    └── branch-prompt.md

tests/
├── commands/
│   └── start.test.ts
├── lib/
│   ├── TerminalColorManager.test.ts # New
│   └── VSCodeIntegration.test.ts    # New
└── mocks/
    ├── MockGitProvider.ts          # Already exists
    ├── MockGitHubProvider.ts       # Already exists
    ├── MockClaudeProvider.ts       # Already exists
    └── MockNeonProvider.ts         # New
```