# Finish Command Implementation Plan

## Overview

This document outlines the plan to implement Issue #7 - the `finish` command for hatchbox-ai. This has been broken down into manageable sub-issues prioritized to get a bare-bones working finish command as quickly as possible for dogfooding hatchbox development.

## Goal

Port the essential functionality of `bash/merge-and-clean.sh` into a working TypeScript implementation that can merge and clean up workspaces. **Priority is getting a usable finish command working ASAP** - Claude assistance and advanced features will be added as follow-up enhancements.

## Implementation Strategy

### Fail-Fast First, Enhance Later
**Phase 1**: Get bare-bones finish working that fails fast on errors
**Phase 2**: Add Claude assistance for automated error fixing
**Phase 3**: Add advanced features like migration handling

This approach allows us to:
- Get hatchbox working for hatchbox development immediately
- Validate core workflow before adding complexity
- Use the tool to develop itself as soon as possible
- Add enhancements incrementally with real usage feedback

### Test-Driven Development
Each sub-issue must follow TDD principles:
- Write tests first
- Achieve >95% code coverage
- Create comprehensive mock factories
- Include unit, integration, and edge case tests
- Test error recovery and rollback mechanisms

## Key Functionality from merge-and-clean.sh

### Core Workflow Steps (from bash script analysis)
1. **Input parsing** - Issue number, PR number, or branch name (lines 52-98)
2. **Worktree navigation** - Find and navigate to the correct worktree (lines 429-448)
3. **Uncommitted changes handling** - Detect and auto-commit using Claude (lines 610-643)
4. **Pre-merge validation** - Run typecheck, lint, and tests (lines 466-567)
5. **Claude-assisted error fixing** - Automated fixing of validation failures (lines 476-563)
6. **Migration conflict handling** - Payload CMS specific (lines 645-775)
7. **Rebase workflow** - Rebase on main with conflict resolution (lines 781-913)
8. **Fast-forward merge** - Merge to main with validation (lines 915-1090)
9. **Post-merge migrations** - Regenerate and apply migrations (lines 1005-1086)
10. **Dev server termination** - Kill dev server on assigned port (lines 1092-1148)
11. **Resource cleanup** - Cleanup worktree and database branches (lines 1150-1157)

### PR Workflow (lines 269-385)
- Check PR status (open vs closed/merged)
- Push changes to remote for open PRs
- Cleanup for closed/merged PRs
- Skip merge workflow for closed PRs

### Claude Integration Points
- Auto-commit message generation (lines 147-191)
- Typecheck error fixing (lines 476-493)
- Lint error fixing (lines 504-521)
- Test failure fixing (lines 542-563)
- Merge conflict resolution (lines 838-894)

## Sub-Issues Breakdown

## Phase 1: Bare-Bones Finish Command (Get Working ASAP)

### Sub-Issue #44: Core Finish Command Structure & Input Validation

**Title**: Implement basic structure and input validation for finish command

**Description**:
Create the foundational structure for the `finish` command with robust input parsing and validation.

**Scope**:
- Create `src/commands/finish.ts` with command class structure
- Implement argument parsing for various input formats:
  - Issue numbers: `hb finish 123`
  - PR numbers with flag: `hb finish --pr 456`
  - Branch names: `hb finish feature/my-branch`
- Add input pattern detection and validation
- Implement option flags:
  - `-f, --force` - Skip confirmation prompts
  - `-n, --dry-run` - Preview actions without executing
  - `--pr <number>` - Treat input as PR number
- Create error handling framework with clear user messages
- Set up command registration in CLI

**Files to Create/Modify**:
- `src/commands/finish.ts`
- `src/commands/index.ts`
- `tests/commands/finish.test.ts`

**Testing Requirements**:
- Unit tests for input parsing logic
- Tests for flag combinations
- Error case tests (invalid inputs, conflicting flags)
- Dry-run mode tests
- Command registration tests

**Acceptance Criteria**:
- [ ] Command accepts issue numbers, PR numbers, and branch names
- [ ] All option flags work correctly
- [ ] Input validation provides clear error messages
- [ ] Dry-run mode previews all actions without executing
- [ ] Command structure follows established patterns
- [ ] 95%+ test coverage
- [ ] Command appears in CLI help

**Dependencies**: None (can start immediately)

**Labels**: `finish:phase-1`

**Estimated Effort**: 2 days

---

### Sub-Issue #45: Pre-Merge Validation Pipeline (Fail-Fast)

**Title**: Implement pre-merge validation that fails fast on errors

**Description**:
Create a validation pipeline that runs typecheck, lint, and tests before merging. **Initially fails fast** - Claude assistance will be added later.

**Scope**:
- Create `src/lib/ValidationRunner.ts` for orchestrating validation
- Implement typecheck validation using project capabilities
- Implement lint validation using project capabilities
- Implement test validation using project capabilities
- Detect and use correct package manager (pnpm, npm, yarn)
- Capture and format validation output
- **FAIL IMMEDIATELY on any validation errors** (no Claude fixing yet)
- Provide clear error messages telling user to fix manually
- Support dry-run mode for previewing validations

**Key Logic to Port**:
```bash
# From merge-and-clean.sh lines 466-567 (but fail immediately)
pnpm typecheck || { echo "Typecheck failed. Please fix errors manually." && exit 1 }
pnpm lint || { echo "Lint failed. Please fix errors manually." && exit 1 }
pnpm vitest run || { echo "Tests failed. Please fix failures manually." && exit 1 }
```

**Files to Create/Modify**:
- `src/lib/ValidationRunner.ts` (new)
- `src/lib/ValidationRunner.test.ts` (new)
- Use existing `ProjectCapabilityDetector` for detecting capabilities
- Use existing `package-manager.ts` utilities

**Testing Requirements**:
- Unit tests with mocked package manager commands
- Test all three validation types independently
- Test validation failure handling
- Test output capture and formatting
- Integration tests with real temporary projects
- Mock factory for validation results

**Acceptance Criteria**:
- [ ] Runs typecheck when TypeScript is detected
- [ ] Runs lint when linter is detected
- [ ] Runs tests when test framework is detected
- [ ] Captures validation output correctly
- [ ] **FAILS IMMEDIATELY** on any validation errors
- [ ] Provides clear error messages for manual fixing
- [ ] Handles missing validation tools gracefully
- [ ] Supports dry-run mode
- [ ] 95%+ test coverage

**Dependencies**: Sub-Issue #44 (command structure)

**Labels**: `finish:phase-1`

**Estimated Effort**: 1 day

---

### Sub-Issue #47: Uncommitted Changes & Basic Commit (No Claude)

**Title**: Implement uncommitted changes detection and basic commit workflow

**Description**:
Create a system for detecting uncommitted changes and committing them with simple commit messages. **Claude assistance will be added later**.

**Scope**:
- Create `src/lib/CommitManager.ts` for commit operations
- Detect uncommitted changes (both staged and unstaged)
- Stage all changes automatically
- **Generate simple commit messages** (no Claude initially)
- Add `Fixes #<issue>` automatically for issues
- Handle commit failures gracefully
- Support dry-run mode

**Key Logic to Port**:
```bash
# From merge-and-clean.sh lines 610-643 (simplified)
UNCOMMITTED_CHANGES=$(git status --porcelain)
if [ -n "$UNCOMMITTED_CHANGES" ]; then
  git add -A
  git commit -m "WIP: Auto-commit for issue #$ISSUE_NUMBER. Fixes #$ISSUE_NUMBER"
fi
```

**Files to Create/Modify**:
- `src/lib/CommitManager.ts` (new)
- `src/lib/CommitManager.test.ts` (new)
- Use existing Git utilities

**Testing Requirements**:
- Unit tests with mocked Git commands
- Test uncommitted change detection
- Test simple commit message generation
- Test `Fixes #` addition for issues
- Mock factory for Git status states
- Integration tests with real Git repositories

**Acceptance Criteria**:
- [ ] Detects uncommitted changes correctly
- [ ] Stages all changes automatically
- [ ] Generates simple, consistent commit messages
- [ ] Includes `Fixes #<issue>` for issues
- [ ] Handles empty commits gracefully
- [ ] Provides clear user feedback
- [ ] Supports dry-run mode
- [ ] 95%+ test coverage

**Dependencies**: Sub-Issue #44 (command structure)

**Labels**: `finish:phase-1`

**Estimated Effort**: 1 day

---

### Sub-Issue #49: Git Rebase & Merge Workflow (Fail-Fast)

**Title**: Implement rebase on main and fast-forward merge with fail-fast on conflicts

**Description**:
Create the core Git workflow for rebasing and merging. **Initially fails fast on conflicts** - Claude assistance will be added later.

**Scope**:
- Create `src/lib/MergeManager.ts` for merge operations
- Implement rebase workflow with user confirmation
- **FAIL IMMEDIATELY on merge conflicts** (no Claude resolution yet)
- Validate fast-forward merge is possible
- Perform fast-forward only merge
- Handle rebase/merge failures gracefully
- Provide clear manual resolution instructions

**Key Logic to Port**:
```bash
# From merge-and-clean.sh lines 781-1090 (but fail on conflicts)
git rebase main || { echo "Rebase conflicts detected. Please resolve manually and re-run." && exit 1 }
MERGE_BASE=$(git merge-base main "$BRANCH_NAME")
if [ "$MERGE_BASE" != "$MAIN_HEAD" ]; then
  echo "Fast-forward merge not possible. Please rebase manually." && exit 1
fi
git checkout main
git merge --ff-only "$BRANCH_NAME"
```

**Files to Create/Modify**:
- `src/lib/MergeManager.ts` (new)
- `src/lib/MergeManager.test.ts` (new)
- Use existing Git utilities

**Testing Requirements**:
- Unit tests with mocked Git commands
- Test rebase workflow with various scenarios
- Test conflict detection and failure
- Test fast-forward validation
- Test merge workflow
- Mock factory for Git conflict states
- Integration tests with real Git repositories
- Test rollback on merge failure

**Acceptance Criteria**:
- [ ] Rebases feature branch on main successfully
- [ ] **FAILS IMMEDIATELY** on merge conflicts with clear instructions
- [ ] Validates fast-forward merge is possible
- [ ] Performs fast-forward only merge
- [ ] Handles rebase/merge failures gracefully
- [ ] Provides clear manual resolution instructions
- [ ] Supports rollback on failure
- [ ] Supports dry-run mode
- [ ] 95%+ test coverage

**Dependencies**: Sub-Issue #44 (command structure), Sub-Issue #45 (validation must pass first)

**Labels**: `finish:phase-1`

**Estimated Effort**: 2 days

---


### Sub-Issue #51: PR Workflow & Integration

**Title**: Implement specialized PR workflow for open and closed PRs

**Description**:
Create a specialized workflow for PRs that pushes changes to remote for open PRs or cleans up for closed/merged PRs.

**Scope**:
- Detect PR state using GitHub CLI
- For open PRs:
  - Commit uncommitted changes
  - Push changes to remote branch
  - Keep worktree active for continued work
- For closed/merged PRs:
  - Skip merge workflow entirely
  - Jump directly to cleanup
- Provide appropriate user feedback for each state
- Handle push failures gracefully
- Support dry-run mode

**Key Logic to Port**:
```bash
# From merge-and-clean.sh lines 269-385
PR_STATE=$(gh pr view "$PR_NUMBER" --json state | jq -r '.state')
if [ "$PR_STATE" = "CLOSED" ] || [ "$PR_STATE" = "MERGED" ]; then
  # Skip to cleanup
  cleanup_worktree "$BRANCH_NAME" "$BRANCH_NAME" true
else
  # Push changes and keep worktree
  git push origin "$BRANCH_NAME"
fi
```

**Files to Create/Modify**:
- `src/commands/finish.ts` (add PR workflow)
- `tests/commands/finish.test.ts` (add PR tests)
- Use existing `GitHubService` for PR state checking

**Testing Requirements**:
- Unit tests with mocked GitHub CLI
- Test PR state detection
- Test open PR workflow (commit + push)
- Test closed PR workflow (cleanup only)
- Test merged PR workflow (cleanup only)
- Mock factory for PR states
- Integration tests with real GitHub API (optional)

**Acceptance Criteria**:
- [ ] Detects PR state correctly
- [ ] Handles open PRs (push changes, keep worktree)
- [ ] Handles closed PRs (cleanup only)
- [ ] Handles merged PRs (cleanup only)
- [ ] Commits uncommitted changes before push
- [ ] Provides appropriate feedback for each state
- [ ] Handles push failures gracefully
- [ ] Supports dry-run mode
- [ ] 95%+ test coverage

**Dependencies**: Sub-Issue #44, #47, and shared ResourceCleanup component (uses commit and cleanup)

**Labels**: `finish:phase-1`

**Estimated Effort**: 1 day

---

## Phase 2: Claude-Assisted Enhancements (Add Intelligence)

### Sub-Issue #46: Claude-Assisted Error Fixing Workflows

**Title**: Add Claude AI integration for automated error fixing

**Description**:
Enhance the existing validation pipeline with Claude assistance to automatically fix typecheck errors, linting issues, and test failures.

**Scope**:
- Create `src/lib/ClaudeErrorFixer.ts` for error fixing workflows
- Integrate with existing `ValidationRunner` to add Claude assistance
- Implement typecheck error fixing workflow
- Implement lint error fixing workflow
- Implement test failure fixing workflow
- Design prompt templates for each error type
- Implement retry and verification logic
- Handle cases where Claude fixes don't resolve issues
- Support manual fallback when Claude unavailable

**Files to Create/Modify**:
- `src/lib/ClaudeErrorFixer.ts` (new)
- `src/lib/ClaudeErrorFixer.test.ts` (new)
- `src/lib/ValidationRunner.ts` (enhance to optionally use Claude)
- `src/prompts/typecheck-fix-prompt.md` (new)
- `src/prompts/lint-fix-prompt.md` (new)
- `src/prompts/test-fix-prompt.md` (new)
- Use existing `ClaudeService` for CLI launching

**Dependencies**: Sub-Issue #45 (ValidationRunner must exist first)

**Labels**: `finish:phase-2`

**Estimated Effort**: 2 days

---

### Sub-Issue #52: Claude-Powered Auto-Commit Messages

**Title**: Enhance commit workflow with Claude-generated messages

**Description**:
Enhance the existing basic commit workflow with Claude-generated commit messages.

**Scope**:
- Enhance existing `CommitManager` to optionally use Claude
- Generate meaningful commit messages based on changes
- Support fallback to simple messages when Claude unavailable
- Allow user to review and edit Claude-generated messages

**Files to Create/Modify**:
- `src/lib/CommitManager.ts` (enhance existing)
- `src/prompts/commit-message-prompt.md` (new)

**Dependencies**: Sub-Issue #47 (basic CommitManager must exist first)

**Labels**: `finish:phase-2`

**Estimated Effort**: 1 day

---

### Sub-Issue #53: Claude-Assisted Conflict Resolution

**Title**: Add Claude assistance for merge conflict resolution

**Description**:
Enhance the existing merge workflow to use Claude for resolving merge conflicts.

**Scope**:
- Enhance existing `MergeManager` to optionally use Claude for conflicts
- Implement conflict analysis and resolution workflows
- Support user review of Claude's conflict resolution
- Maintain fail-fast fallback when Claude unavailable

**Files to Create/Modify**:
- `src/lib/MergeManager.ts` (enhance existing)
- `src/prompts/conflict-resolution-prompt.md` (new)

**Dependencies**: Sub-Issue #49 (basic MergeManager must exist first)

**Labels**: `finish:phase-2`

**Estimated Effort**: 2 days

---

## Phase 3: Advanced Features (Low Priority)

### Sub-Issue #48: Migration Conflict Detection & Resolution

**Title**: Implement Payload CMS migration conflict handling

**Description**:
Create a specialized system for detecting and resolving migration conflicts in Payload CMS projects. **This is low priority** since it's framework-specific and not in all projects.

**Scope**:
- Create `src/lib/MigrationManager.ts` for migration operations
- Detect branch-specific migrations (created after branch diverged)
- Remove conflicting migration pairs (.ts and .json files)
- Revert migrations/index.ts to main branch version
- Commit migration removal changes
- Post-merge: regenerate migrations if schema changed
- Run regenerated migrations on database
- Commit regenerated migrations

**Dependencies**: Phase 1 completion (basic finish workflow working)

**Labels**: `finish:phase-3`

**Estimated Effort**: 3 days

---

### Sub-Issue #49: Git Rebase & Merge Workflow

**Title**: Implement rebase on main and fast-forward merge with conflict resolution

**Description**:
Create the core Git workflow for rebasing feature branches on main and performing fast-forward merges with intelligent conflict resolution.

**Scope**:
- Create `src/lib/MergeManager.ts` for merge operations
- Implement rebase workflow with user confirmation
- Detect and handle merge conflicts
- Integrate Claude for conflict resolution
- Validate fast-forward merge is possible
- Perform fast-forward only merge
- Handle rebase/merge failures gracefully
- Support user review of Claude's conflict resolution

**Key Logic to Port**:
```bash
# From merge-and-clean.sh lines 781-1090
# 1. Rebase on main
git rebase main || { handle_conflicts_with_claude }
# 2. Check fast-forward is possible
MERGE_BASE=$(git merge-base main "$BRANCH_NAME")
if [ "$MERGE_BASE" != "$MAIN_HEAD" ]; then
  exit 1  # Can't fast-forward
fi
# 3. Merge with fast-forward only
git checkout main
git merge --ff-only "$BRANCH_NAME"
```

**Files to Create/Modify**:
- `src/lib/MergeManager.ts` (new)
- `src/lib/MergeManager.test.ts` (new)
- `src/prompts/conflict-resolution-prompt.md` (new)
- Use existing `ClaudeService` for conflict resolution
- Use existing Git utilities

**Testing Requirements**:
- Unit tests with mocked Git commands
- Test rebase workflow with various scenarios
- Test conflict detection and resolution
- Test fast-forward validation
- Test merge workflow
- Mock factory for Git conflict states
- Integration tests with real Git repositories
- Test rollback on merge failure

**Acceptance Criteria**:
- [ ] Rebases feature branch on main successfully
- [ ] Detects merge conflicts correctly
- [ ] Uses Claude to resolve conflicts automatically
- [ ] Allows user review of conflict resolution
- [ ] Validates fast-forward merge is possible
- [ ] Performs fast-forward only merge
- [ ] Handles rebase/merge failures gracefully
- [ ] Provides clear error messages
- [ ] Supports rollback on failure
- [ ] 95%+ test coverage

**Dependencies**:
- Sub-Issue #44 (command structure)
- Sub-Issue #46 (Claude error fixing for conflict resolution)

**Estimated Effort**: 3 days

---

### Sub-Issue #50: Resource Cleanup & Dev Server Termination

**Title**: Implement comprehensive resource cleanup including dev server termination

**Description**:
Create a robust cleanup system that terminates dev servers, removes worktrees, deletes branches, and cleans up database resources.

**Scope**:
- Create `src/lib/ResourceCleanup.ts` for cleanup operations
- Detect and terminate dev server on assigned port
- Enhanced process detection (not just port, but process type)
- Call existing cleanup script or implement inline
- Remove Git worktree
- Delete feature branch (local and optionally remote)
- Clean up database branches (when implemented)
- Handle cleanup failures gracefully
- Provide manual cleanup instructions on failure

**Key Logic to Port**:
```bash
# From merge-and-clean.sh lines 1092-1157
# 1. Kill dev server on port (3000 + issue/PR number)
PORT_INFO=$(lsof -i:${DEV_SERVER_PORT} -P 2>/dev/null | grep LISTEN)
if [[ "$PROCESS_NAME" =~ ^(node|npm|pnpm|next|vite)$ ]]; then
  kill -9 "$DEV_SERVER_PID"
fi
# 2. Cleanup worktree and branch
./scripts/workflow/cleanup-worktree.sh "$input_ref"
```

**Files to Create/Modify**:
- `src/lib/ResourceCleanup.ts` (new)
- `src/lib/ResourceCleanup.test.ts` (new)
- Integrate with existing `GitWorktreeManager.removeWorktree()`
- Integrate with future `DatabaseManager.deleteBranch()`

**Testing Requirements**:
- Unit tests with mocked process and Git commands
- Test dev server detection logic
- Test process type validation
- Test worktree removal
- Test branch deletion
- Test cleanup failure handling
- Mock factory for process states
- Cross-platform compatibility tests

**Acceptance Criteria**:
- [ ] Detects dev server on assigned port correctly
- [ ] Validates process is actually a dev server
- [ ] Terminates dev server safely
- [ ] Removes Git worktree successfully
- [ ] Deletes feature branch (local)
- [ ] Cleans up database branches (when available)
- [ ] Provides manual instructions on failure
- [ ] Handles partial cleanup gracefully
- [ ] Works cross-platform
- [ ] 95%+ test coverage

**Dependencies**:
- Sub-Issue #44 (command structure)
- Sub-Issue #49 (after successful merge)

**Estimated Effort**: 2 days

---

### Sub-Issue #51: PR Workflow & Integration

**Title**: Implement specialized PR workflow for open and closed PRs

**Description**:
Create a specialized workflow for PRs that pushes changes to remote for open PRs or cleans up for closed/merged PRs.

**Scope**:
- Detect PR state using GitHub CLI
- For open PRs:
  - Commit uncommitted changes
  - Push changes to remote branch
  - Keep worktree active for continued work
- For closed/merged PRs:
  - Skip merge workflow entirely
  - Jump directly to cleanup
- Provide appropriate user feedback for each state
- Handle push failures gracefully

**Key Logic to Port**:
```bash
# From merge-and-clean.sh lines 269-385
PR_STATE=$(gh pr view "$PR_NUMBER" --json state | jq -r '.state')
if [ "$PR_STATE" = "CLOSED" ] || [ "$PR_STATE" = "MERGED" ]; then
  # Skip to cleanup
  cleanup_worktree "$BRANCH_NAME" "$BRANCH_NAME" true
else
  # Push changes and keep worktree
  git push origin "$BRANCH_NAME"
fi
```

**Files to Create/Modify**:
- `src/commands/finish.ts` (add PR workflow)
- `tests/commands/finish.test.ts` (add PR tests)
- Use existing `GitHubService` for PR state checking

**Testing Requirements**:
- Unit tests with mocked GitHub CLI
- Test PR state detection
- Test open PR workflow (commit + push)
- Test closed PR workflow (cleanup only)
- Test merged PR workflow (cleanup only)
- Mock factory for PR states
- Integration tests with real GitHub API (optional)

**Acceptance Criteria**:
- [ ] Detects PR state correctly
- [ ] Handles open PRs (push changes, keep worktree)
- [ ] Handles closed PRs (cleanup only)
- [ ] Handles merged PRs (cleanup only)
- [ ] Commits uncommitted changes before push
- [ ] Provides appropriate feedback for each state
- [ ] Handles push failures gracefully
- [ ] 95%+ test coverage

**Dependencies**:
- Sub-Issue #44 (command structure)
- Sub-Issue #47 (uncommitted changes handling)
- Sub-Issue #50 (cleanup for closed PRs)

**Estimated Effort**: 2 days

---

### Sub-Issue #52: Finish Command Integration & Polish

**Title**: Integrate all finish command components and add final polish

**Description**:
Bring all finish command components together, add comprehensive error handling, rollback mechanisms, and user experience polish.

**Scope**:
- Integrate all finish command sub-components into main workflow
- Implement comprehensive error handling at each step
- Add rollback mechanisms for partial failures
- Implement progress indicators for long operations
- Add comprehensive logging and user feedback
- Create final summary output
- Add confirmation prompts where appropriate
- Support force and dry-run modes throughout
- Integration testing of complete workflows

**Complete Workflow**:
1. Parse and validate input
2. Find and navigate to worktree
3. Handle uncommitted changes
4. Run pre-merge validation (with Claude fixing)
5. Handle migration conflicts (if Payload CMS)
6. Rebase on main (with conflict resolution)
7. Fast-forward merge to main
8. Handle post-merge migrations
9. Terminate dev server
10. Cleanup resources
11. Display summary

**Files to Modify**:
- `src/commands/finish.ts` (integrate everything)
- `tests/commands/finish.test.ts` (end-to-end tests)
- `src/lib/HatchboxManager.ts` (add finishHatchbox implementation)

**Testing Requirements**:
- End-to-end integration tests for complete workflow
- Test error handling at each step
- Test rollback mechanisms
- Test dry-run mode for entire workflow
- Test force mode for entire workflow
- Performance testing against bash script
- Regression testing for bash script parity

**Acceptance Criteria**:
- [ ] Complete workflow executes successfully
- [ ] Error handling at every step
- [ ] Rollback mechanisms work correctly
- [ ] Dry-run previews all actions
- [ ] Force mode skips confirmations
- [ ] Progress indicators for long operations
- [ ] Comprehensive logging throughout
- [ ] Final summary displays correctly
- [ ] Performance matches bash script
- [ ] 100% feature parity with bash script
- [ ] 95%+ test coverage

**Dependencies**: All previous sub-issues (#44-51)

**Estimated Effort**: 3 days

---

## Implementation Timeline

### Phase 1: Bare-Bones Finish Command (1 Week - PRIORITY)
**Goal**: Get working finish command ASAP for dogfooding

- **Day 1**: Sub-Issue #44 - Core Command Structure (1 day)
- **Day 2**: Sub-Issue #45 - Validation Pipeline (Fail-Fast) (1 day)
- **Day 3**: Sub-Issue #47 - Basic Commit Workflow (1 day)
- **Day 4-5**: Sub-Issue #49 - Rebase & Merge (Fail-Fast) (2 days)
- **Day 6**: Sub-Issue #51 - PR Workflow (1 day)

**Total Phase 1**: 1 week (5 working days)
**Result**: Working finish command that fails fast on errors

**Dependencies**: Requires shared ResourceCleanup component (can be developed in parallel)

### Phase 2: Claude Intelligence (1 Week - ENHANCEMENT)
**Goal**: Add Claude assistance to existing workflow

- **Sub-Issue #46**: Claude Error Fixing (2 days)
- **Sub-Issue #52**: Claude Auto-Commit Messages (1 day)
- **Sub-Issue #53**: Claude Conflict Resolution (2 days)

**Total Phase 2**: 1 week (5 working days)
**Result**: Intelligent error fixing and assistance

### Phase 3: Advanced Features (Future - LOW PRIORITY)
**Goal**: Framework-specific features when needed

- **Sub-Issue #48**: Migration Handling (3 days) - Only if using Payload CMS

**Total Phase 3**: As needed

**Overall Timeline**: 2 weeks for full featured finish command, 1 week for bare-bones working version

## Parallelization Opportunities

### Phase 1 (Mostly Sequential - Critical Path)
- Sub-issues are mostly sequential for Phase 1 to get working command ASAP
- #44 → #45 → #47 → #49 → #51 (linear dependencies)
- **ResourceCleanup component can be developed in parallel** with finish command

### Phase 2 (Can Parallelize)
- #46, #52, #53 can be developed in parallel as they enhance different parts
- Each enhances existing Phase 1 components independently

## Success Metrics

### Phase 1 Success (Priority)
- **Working finish command** that can merge and cleanup workspaces
- **Can be used for hatchbox development immediately**
- Handles core scenarios: issues, PRs, branches
- Fails fast with clear error messages
- Zero data loss during operations
- >95% test coverage for implemented features

### Phase 2 Success (Enhancement)
- Claude assistance improves workflow efficiency
- Automatic error fixing reduces manual intervention
- Intelligent commit messages save developer time
- Maintains reliability with fallback to Phase 1 behavior

### Quality Requirements (All Phases)
- >95% test coverage across all code
- Comprehensive mock factories for all external dependencies
- Performance within 10% of bash script
- Robust rollback on failures
- Clear error messages and recovery paths

## Risk Mitigation

### Technical Risks
1. **Claude integration complexity**: Mitigate with comprehensive mocking and fallbacks
2. **Git conflict resolution**: Extensive testing with various conflict scenarios
3. **Cross-platform dev server detection**: Test on multiple platforms early
4. **Rollback mechanism complexity**: Design rollback from day one

### Process Risks
1. **Scope creep**: Strict adherence to sub-issue boundaries
2. **Integration challenges**: Regular integration testing throughout
3. **Timeline pressure**: Prioritize critical path features first

## Rollback & Error Recovery Strategy

### Rollback Points
The finish command must support rollback at these points:
1. **Before rebase**: Clean rollback state
2. **After failed rebase**: `git rebase --abort`
3. **Before merge**: No changes to main yet
4. **After failed merge**: Rare but handle gracefully
5. **After failed cleanup**: Provide manual instructions

### Error Recovery
Each component must handle these scenarios:
- **Validation failures**: Claude attempts fix, fallback to manual
- **Rebase conflicts**: Claude attempts resolution, fallback to manual
- **Merge failures**: Abort and provide clear instructions
- **Cleanup failures**: Provide manual cleanup commands
- **Partial success**: Clear indication of what succeeded/failed

## Testing Strategy

### Unit Testing
- Each class/method tested independently
- Comprehensive mocking of external dependencies
- Edge cases and error scenarios
- Cross-platform compatibility

### Integration Testing
- Complete workflow scenarios
- Real Git repositories (temporary)
- Real GitHub API interactions (optional, mocked by default)
- Database operations (when implemented)

### Regression Testing
- Automated comparison with bash script behavior
- Output format verification
- Resource cleanup verification
- Performance benchmarking

### Property-Based Testing
- Use fast-check for edge case discovery
- Git state transitions
- Migration detection logic
- Process detection algorithms

## Definition of Done

### Phase 1 Done (Priority Target)
The bare-bones finish command is complete when:

1. All Phase 1 sub-issues (#44, #45, #47, #49, #50, #51) are implemented
2. Core workflow executes successfully: validate → rebase → merge → cleanup
3. **Can be used for hatchbox development immediately**
4. Fails fast with clear error messages on conflicts/errors
5. Integration tests pass for complete workflow
6. >95% test coverage for implemented features
7. Cross-platform compatibility verified
8. Performance acceptable for regular use

### Phase 2 Done (Enhancement Target)
Claude-assisted features are complete when:

1. All Phase 2 sub-issues (#46, #52, #53) enhance existing Phase 1 components
2. Claude assistance works reliably with fallback to Phase 1 behavior
3. User feedback from Phase 1 dogfooding is incorporated
4. Enhanced workflow improves developer productivity

### Complete Implementation Done
The finish command implementation is fully complete when:

1. 100% feature parity with `merge-and-clean.sh`
2. All phases implemented and tested
3. Documentation is complete
4. Performance benchmarks are met

## Dependencies on Other Issues

### Completed Dependencies
- Issue #1: TypeScript project infrastructure ✅
- Issue #2: Git Worktree Management ✅
- Issue #3: GitHub Integration ✅
- Issue #4: Environment Management ✅
- Issue #12: Claude CLI Integration ✅
- Issue #41: HatchboxManager ✅

### Parallel Dependencies
- **ResourceCleanup Component**: Shared component for resource cleanup (can be developed in parallel)
- Issue #5: Database Branch Management (for cleanup, can be mocked initially)
- Issue #14: Payload CMS Migration Support (part of Sub-Issue #48)

### Future Enhancements
- Issue #13: AI-Assisted Features (extends Sub-Issue #46)
- Issue #15: Test Infrastructure (continuous improvement)

## Notes

- Each sub-issue should have its own PR
- Code review required for each PR
- Integration tests run after each merge
- Regular dogfooding to validate UX decisions
- Performance benchmarks tracked in CI
- Bash script comparison tests for regression prevention

## Appendix: Key Files and Their Purposes

### New Files to Create

```
src/
├── commands/
│   └── finish.ts                      # Main command implementation
├── lib/
│   ├── ValidationRunner.ts            # Sub-Issue #45
│   ├── ClaudeErrorFixer.ts           # Sub-Issue #46
│   ├── CommitManager.ts              # Sub-Issue #47
│   ├── MigrationManager.ts           # Sub-Issue #48
│   ├── MergeManager.ts               # Sub-Issue #49
│   └── ResourceCleanup.ts            # SHARED COMPONENT (not created by finish)
└── prompts/
    ├── commit-message-prompt.md      # Sub-Issue #47
    ├── typecheck-fix-prompt.md       # Sub-Issue #46
    ├── lint-fix-prompt.md            # Sub-Issue #46
    ├── test-fix-prompt.md            # Sub-Issue #46
    └── conflict-resolution-prompt.md  # Sub-Issue #49

tests/
├── commands/
│   └── finish.test.ts
└── lib/
    ├── ValidationRunner.test.ts
    ├── ClaudeErrorFixer.test.ts
    ├── CommitManager.test.ts
    ├── MigrationManager.test.ts
    ├── MergeManager.test.ts
    └── ResourceCleanup.test.ts        # SHARED COMPONENT (not created by finish)
```

### Existing Files to Modify

```
src/
├── lib/
│   └── HatchboxManager.ts            # Add finishHatchbox() implementation
└── types/
    └── hatchbox.ts                   # May need additional types
```

## Bash Script Feature Matrix

| Feature | Bash Script Lines | TypeScript Sub-Issue | Status |
|---------|------------------|---------------------|--------|
| Input parsing | 52-98 | #44 | Not started |
| Worktree navigation | 429-448 | #44 | Not started |
| Uncommitted changes | 610-643 | #47 | Not started |
| Auto-commit with Claude | 147-191 | #47 | Not started |
| Typecheck validation | 466-495 | #45 | Not started |
| Lint validation | 499-524 | #45 | Not started |
| Test validation | 527-567 | #45 | Not started |
| Claude typecheck fixing | 476-493 | #46 | Not started |
| Claude lint fixing | 504-521 | #46 | Not started |
| Claude test fixing | 542-563 | #46 | Not started |
| Migration detection | 645-700 | #48 | Not started |
| Migration removal | 719-774 | #48 | Not started |
| Migration regeneration | 1005-1086 | #48 | Not started |
| Rebase workflow | 781-913 | #49 | Not started |
| Conflict resolution | 826-902 | #49 | Not started |
| Fast-forward merge | 915-1090 | #49 | Not started |
| Dev server termination | 1092-1148 | ResourceCleanup (shared) | Dependency |
| Worktree cleanup | 1150-1157 | ResourceCleanup (shared) | Dependency |
| PR state detection | 269-288 | #51 | Not started |
| PR push workflow | 309-380 | #51 | Not started |
| PR cleanup workflow | 290-308 | #51 | Not started |

## Examples of Expected Behavior

### Example 1: Successful Issue Merge
```bash
$ hb finish 123

🔍 Detecting workspace for issue #123...
✅ Found worktree at /path/to/.worktrees/issue-123-add-feature

📋 Checking for uncommitted changes...
⚠️  Found uncommitted changes
🤖 Generating commit message using Claude...
✅ Changes committed: "Add feature implementation for issue #123. Fixes #123"

🔍 Running pre-merge validation...
✅ Typecheck passed
✅ Lint passed
✅ Tests passed

🔄 Rebasing on main...
✅ Rebase completed successfully

🔀 Merging into main...
✅ Fast-forward merge successful

🧹 Cleaning up resources...
✅ Dev server terminated (port 3123)
✅ Worktree removed
✅ Branch deleted

🎉 Successfully merged and cleaned up issue #123!

Summary:
  • Issue: #123 - Add new feature
  • Branch: issue-123-add-feature
  • Commits: 3 commits merged
  • Next: Push to origin with 'git push origin main'
```

### Example 2: Phase 1 - Validation Failure (Fail-Fast)
```bash
$ hb finish feature/my-branch

🔍 Running pre-merge validation...
❌ Typecheck failed

❌ Finish command failed: Validation errors detected
Please fix the following errors manually and re-run:

TypeScript errors in src/components/Button.tsx:
  Line 23: Property 'onClick' does not exist on type 'Props'
  Line 45: Type 'string' is not assignable to type 'number'

Run the following commands to fix:
  pnpm typecheck    # See full error details
  # Fix errors manually
  hb finish 123     # Re-run when fixed
```

### Example 3: Phase 2 - Validation Failure (Claude Assistance)
```bash
$ hb finish feature/my-branch

🔍 Running pre-merge validation...
❌ Typecheck failed

🤖 Launching Claude to fix type errors...
✅ Claude resolved type errors
🔍 Re-running typecheck...
✅ Typecheck now passes

✅ Lint passed
✅ Tests passed

[... continues with rebase and merge ...]
```

### Example 4: Dry Run Mode
```bash
$ hb finish 123 --dry-run

[DRY RUN] Would navigate to worktree for issue #123
[DRY RUN] Would check for uncommitted changes
[DRY RUN] Would run pre-merge validation
[DRY RUN] Would rebase on main
[DRY RUN] Would merge with fast-forward
[DRY RUN] Would terminate dev server on port 3123
[DRY RUN] Would cleanup worktree and branch

No changes made (dry run mode)
```

### Example 5: PR Workflow (Open PR)
```bash
$ hb finish --pr 456

📋 Fetching PR #456 status...
✅ PR #456: Add authentication
🔓 PR is OPEN - will push changes and keep worktree active

📝 Committing uncommitted changes...
✅ Changes committed

⬆️  Pushing changes to origin...
✅ Successfully pushed changes to PR

🎉 PR changes pushed successfully!

Summary:
  • PR: #456 - Add authentication
  • Status: OPEN
  • Worktree remains active for continued work
  • Changes pushed to remote

💡 Next steps:
  • Continue working in this worktree as needed
  • Check the PR on GitHub to see your updates
  • Run 'hb finish --pr 456' again when PR is merged
```

This comprehensive plan prioritizes getting a working finish command as quickly as possible for immediate dogfooding, then adds Claude intelligence as enhancements. **Phase 1 delivers a usable finish command in 1 week** that fails fast on errors with clear manual resolution instructions. Phase 2 adds Claude assistance to automate error fixing and improve the developer experience. Each sub-issue has clear acceptance criteria, dependencies, and testing requirements to ensure successful implementation.
