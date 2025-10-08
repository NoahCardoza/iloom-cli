# Cleanup Command Implementation Plan

## Overview

This document outlines the plan to implement issue #8 - the `cleanup` command for hatchbox-ai. The original issue is too large to implement as a single task, so we're breaking it down into 5 manageable sub-issues that can be developed and tested independently.

## Goal

Port the functionality of `bash/cleanup-worktree.sh` into a robust, testable TypeScript implementation with enhanced safety mechanisms, user-friendly confirmations, and proper database cleanup integration. **This command uses a shared ResourceCleanup component** that provides the core cleanup functionality used by both `finish` and `cleanup` commands.

## Implementation Strategy

### Phased Approach
We'll implement the command in phases, with each sub-issue building upon the previous work while remaining independently testable and mergeable. This allows us to:
- Maintain a working state between each phase
- Get incremental feedback and validation
- Reduce complexity and cognitive load
- Add safety mechanisms incrementally

### Test-Driven Development
Each sub-issue must follow TDD principles:
- Write tests first
- Achieve >95% code coverage
- Create comprehensive mock factories
- Include unit, integration, and edge case tests
- Test error recovery and rollback scenarios

## Current Bash Script Analysis

### Key Functionality from `cleanup-worktree.sh`

1. **List Mode** (lines 51-64): Display all worktrees with colored output
2. **Single Worktree Removal** (lines 84-130): Remove specific worktree by branch name
3. **Issue-based Cleanup** (lines 132-242): Find and remove all worktrees for an issue
4. **Bulk Cleanup** (lines 244-318): Remove all worktrees with confirmation
5. **Numeric Detection** (lines 364-369): Auto-detect if input is issue number or branch name
6. **Database Integration** (lines 99, 111, 211, 298): Cleanup Neon database branches

### Safety Mechanisms in Bash Script

- Interactive confirmations (lines 67-81)
- Force flag to bypass confirmations
- Safe branch deletion using `-d` flag (only merged branches)
- Database cleanup with special handling for Vercel preview databases
- Graceful handling of missing worktrees (still cleanup database)

### Integration Points

- **Neon CLI**: Database branch cleanup
- **Git**: Worktree and branch management
- **GitHub CLI**: Issue number to branch mapping

## Sub-Issues Breakdown

### Sub-Issue #1: Core Cleanup Command Structure & Options

**Title**: Implement basic structure and option parsing for cleanup command

**Description**:
Create the foundational structure for the `cleanup` command with comprehensive option parsing and validation.

**Scope**:
- Create `src/commands/cleanup.ts` with command class structure
- Implement option parsing:
  - `--list, -l`: List all worktrees
  - `--all, -a`: Remove all worktrees (interactive)
  - `--issue <number>, -i <number>`: Cleanup by issue number
  - `--force, -f`: Skip confirmations
  - `--dry-run`: Show what would be done without doing it
  - `[identifier]`: Positional argument (branch name or issue number)
- Add auto-detection of numeric vs branch name input
- Create error handling framework with clear user messages
- Set up command registration in CLI

**Files to Create/Modify**:
- `src/commands/cleanup.ts`
- `src/commands/index.ts`
- `tests/commands/cleanup.test.ts`

**Testing Requirements**:
- Unit tests for option parsing logic
- Tests for option conflicts (e.g., `--all` with positional arg)
- Auto-detection tests (numeric vs branch name)
- Error case tests (invalid inputs, missing args)
- Command registration tests

**Acceptance Criteria**:
- [ ] Command accepts all specified options
- [ ] Auto-detects numeric input as issue number
- [ ] Auto-detects non-numeric input as branch name
- [ ] Validates option combinations
- [ ] Provides clear error messages
- [ ] Command appears in CLI help
- [ ] 95%+ test coverage

**Dependencies**: None (can start immediately)

**Labels**: `cleanup:phase-1`

**Estimated Timeline**: 2 days

---

### Sub-Issue #2: List Worktrees with Rich Information

**Title**: Implement worktree listing with enhanced display

**Description**:
Create the `--list` functionality that displays all worktrees with colored, formatted output showing relevant information.

**Scope**:
- Use existing `HatchboxManager.listHatchboxes()` method
- Format output with colors and icons
- Display key information:
  - Worktree path
  - Branch name
  - Issue/PR number (if applicable)
  - Port assignment
  - Database branch status (if exists)
  - Last accessed time (future enhancement)
- Handle empty state (no worktrees)
- Port colored output from bash script (lines 51-64)

**Key Logic to Port**:
```bash
# From cleanup-worktree.sh lines 51-64
list_worktrees() {
    echo -e "${BLUE}📋 Current git worktrees:${NC}"
    git worktree list --porcelain | while IFS= read -r line; do
        if [[ $line == worktree* ]]; then
            worktree_path="${line#worktree }"
            echo -n -e "${GREEN}📁 ${worktree_path}${NC}"
        elif [[ $line == branch* ]]; then
            branch_name="${line#branch refs/heads/}"
            echo -e " → ${YELLOW}${branch_name}${NC}"
        fi
    done
}
```

**Files to Modify**:
- `src/commands/cleanup.ts` (add list implementation)
- `tests/commands/cleanup.test.ts`

**Testing Requirements**:
- Test with no worktrees
- Test with single worktree
- Test with multiple worktrees
- Test with PR worktrees (special naming)
- Test output formatting
- Snapshot tests for output consistency

**Acceptance Criteria**:
- [ ] Lists all worktrees with formatted output
- [ ] Uses colors and icons for clarity
- [ ] Shows all relevant information
- [ ] Handles empty state gracefully
- [ ] Sorts output logically
- [ ] 95%+ test coverage

**Dependencies**: Sub-Issue #1 (command structure)

**Labels**: `cleanup:phase-1`

**Estimated Timeline**: 1 day

---

### Sub-Issue #3: Single Worktree Removal

**Title**: Implement single worktree cleanup by branch name

**Description**:
Add functionality to remove a single worktree by its branch name with interactive confirmation and comprehensive cleanup.

**Scope**:
- **Use shared ResourceCleanup component** for all cleanup operations
- Implement interactive confirmation (unless `--force`)
- Handle missing worktrees gracefully
- Show worktree details before removal
- Use ResourceCleanup for:
  - Worktree directory removal
  - Git branch deletion (with confirmation)
  - Database branch cleanup (if exists)
  - Dev server termination
- Provide clear feedback during each step
- Handle errors at each stage without partial cleanup

**Key Logic to Port**:
```bash
# From cleanup-worktree.sh lines 84-130
remove_worktree() {
    local branch_name="$1"
    local worktree_path=$(find_worktree_for_branch "$branch_name")

    if [ -z "$worktree_path" ]; then
        echo "Warning: Worktree not found"
        # Still try database cleanup
        delete_neon_database_branch "$branch_name" false
        return 0
    fi

    echo "Removing worktree for branch: ${branch_name}"
    echo "Path: ${worktree_path}"

    if confirm "Remove this worktree?"; then
        git worktree remove "$worktree_path"
        delete_neon_database_branch "$branch_name" "$(is_pr_worktree "$worktree_path")"

        if confirm "Also delete the branch?"; then
            git branch -D "$branch_name"
        fi
    fi
}
```

**Files to Modify**:
- `src/commands/cleanup.ts` (add single removal using ResourceCleanup)
- `src/lib/HatchboxManager.ts` (implement `cleanupHatchbox()` method using ResourceCleanup)
- `tests/commands/cleanup.test.ts`
- `tests/lib/HatchboxManager.test.ts`

**Dependencies**:
- Sub-Issue #1 (command structure)
- **Shared ResourceCleanup component** (can be developed in parallel)

**Labels**: `cleanup:phase-1`

**Testing Requirements**:
- Test normal removal flow
- Test missing worktree (database-only cleanup)
- Test with `--force` flag
- Test confirmation prompts
- Test branch deletion prompts
- Test error handling at each stage
- Test rollback on failure

**Acceptance Criteria**:
- [ ] Removes worktree successfully
- [ ] Prompts for confirmation (unless `--force`)
- [ ] Handles missing worktrees gracefully
- [ ] Cleans up database branch
- [ ] Optionally removes git branch
- [ ] Provides clear feedback
- [ ] No partial cleanup on errors
- [ ] 95%+ test coverage

**Estimated Timeline**: 2 days

---

### Sub-Issue #4: Issue-based Cleanup

**Title**: Implement cleanup of all worktrees for a GitHub issue

**Description**:
Add functionality to find and remove all worktrees associated with a GitHub issue number, including various branch naming patterns.

**Scope**:
- Implement branch search algorithm for issue numbers
- Support multiple naming patterns:
  - `issue-25`, `issue/25`
  - `25-feature-name`
  - `feat-25`, `feat/issue-25`
  - Any pattern with issue number surrounded by non-digits
- Display all found branches before removal
- Show which branches have worktrees vs branch-only
- **Use shared ResourceCleanup component** for actual cleanup operations
- Batch removal with individual confirmations (or bulk with `--force`)
- Track and report statistics (removed, failed, skipped)
- Safe branch deletion (only merged branches)

**Key Logic to Port**:
```bash
# From cleanup-worktree.sh lines 132-242
find_issue_branches() {
    local issue_number="$1"
    local branches=()

    while IFS= read -r branch; do
        clean_branch="${branch#origin/}"
        clean_branch=$(echo "$clean_branch" | sed 's/^[+* ] *//')

        # Skip main branches
        if [[ "$clean_branch" =~ ^(main|master|develop)$ ]]; then
            continue
        fi

        # Check if branch contains issue number
        if [[ "$clean_branch" =~ (^|[^0-9])$issue_number([^0-9]|$) ]]; then
            branches+=("$clean_branch")
        fi
    done < <(git branch -a | sed 's/^[ *]*//')

    printf '%s\n' "${branches[@]}"
}
```

**Files to Modify**:
- `src/commands/cleanup.ts` (add issue-based cleanup)
- `src/utils/git.ts` (add branch search utilities)
- `tests/commands/cleanup.test.ts`
- `tests/utils/git.test.ts`

**Testing Requirements**:
- Test with various branch naming patterns
- Test with no matching branches
- Test with multiple matching branches
- Test with mix of worktrees and branch-only
- Test batch removal flow
- Test statistics reporting
- Test safe vs force branch deletion

**Acceptance Criteria**:
- [ ] Finds all branches for issue number
- [ ] Supports multiple naming patterns
- [ ] Displays preview before removal
- [ ] Shows worktree vs branch-only status
- [ ] Removes all found worktrees
- [ ] Reports detailed statistics
- [ ] Handles partial failures gracefully
- [ ] 95%+ test coverage

**Dependencies**:
- Sub-Issue #3 (single removal logic)
- **Shared ResourceCleanup component** (for actual cleanup operations)

**Labels**: `cleanup:phase-2`

**Estimated Timeline**: 3 days

---

### Sub-Issue #5: Bulk Cleanup (All Worktrees)

**Title**: Implement bulk removal of all worktrees with safety checks

**Description**:
Add functionality to remove all worktrees at once with comprehensive safety mechanisms and clear feedback.

**Scope**:
- Find all non-main worktrees
- Display comprehensive summary before removal
- Require confirmation (unless `--force`)
- **Use shared ResourceCleanup component** for all removal operations
- Remove worktrees in sequence
- Track success/failure for each removal
- Clean up database branches for each worktree
- Optionally clean up merged branches
- Provide detailed completion statistics
- Handle the main worktree specially (never remove)

**Key Logic to Port**:
```bash
# From cleanup-worktree.sh lines 244-318
remove_all_worktrees() {
    # Get all worktrees except the main one
    local worktrees=()
    while IFS= read -r line; do
        if [[ $line == worktree* ]]; then
            worktree_path="${line#worktree }"
            # Skip the main worktree
            if [[ "$worktree_path" != "$(git rev-parse --show-toplevel)" ]]; then
                worktrees+=("$worktree_path")
            fi
        fi
    done < <(git worktree list --porcelain)

    if confirm "Remove all ${#worktrees[@]} worktree(s)?"; then
        for worktree in "${worktrees[@]}"; do
            git worktree remove "$worktree"
            # Database cleanup...
        done

        if confirm "Also clean up any merged branches?"; then
            git branch --merged | grep -v "\*\|main\|master\|develop" | xargs -n 1 git branch -d
        fi
    fi
}
```

**Files to Modify**:
- `src/commands/cleanup.ts` (add bulk removal)
- `tests/commands/cleanup.test.ts`

**Testing Requirements**:
- Test with no worktrees
- Test with single worktree
- Test with multiple worktrees
- Test confirmation flow
- Test `--force` flag
- Test partial failures
- Test merged branch cleanup
- Test main worktree protection

**Acceptance Criteria**:
- [ ] Finds all non-main worktrees
- [ ] Displays clear summary
- [ ] Requires confirmation
- [ ] Removes all worktrees successfully
- [ ] Tracks and reports statistics
- [ ] Protects main worktree
- [ ] Optionally cleans merged branches
- [ ] Handles failures gracefully
- [ ] 95%+ test coverage

**Dependencies**:
- Sub-Issue #3 (single removal logic)
- **Shared ResourceCleanup component** (for actual cleanup operations)

**Labels**: `cleanup:phase-2`

**Estimated Timeline**: 2 days

---


## Implementation Timeline

**Prerequisites**: Requires shared ResourceCleanup component (can be developed in parallel with cleanup command)

### Phase 1: Foundation (Week 1)
- Sub-Issue #1: Core Command Structure (2 days)
- Sub-Issue #2: List Worktrees (1 day)
- Sub-Issue #3: Single Worktree Removal (2 days)

### Phase 2: Batch Operations (Week 2)
- Sub-Issue #4: Issue-based Cleanup (3 days)
- Sub-Issue #5: Bulk Cleanup (2 days)

**Total Timeline**: 2 weeks (10 working days)
**Result**: Complete cleanup command with all modes and safety mechanisms

**Note**: Database cleanup functionality is included in the shared ResourceCleanup component, not as a separate sub-issue.

## Safety Mechanisms

### Confirmation Flows

1. **Single Worktree Removal**:
   - Confirm worktree removal
   - Confirm branch deletion (separate)

2. **Issue-based Cleanup**:
   - Show all matching branches
   - Confirm batch removal
   - Confirm each branch deletion

3. **Bulk Cleanup**:
   - Show count and list
   - Confirm bulk removal
   - Confirm merged branch cleanup

### Force Flag Behavior

The `--force` flag bypasses all confirmations but maintains other safety checks:
- Still validates worktree existence
- Still checks for main worktree (never removes)
- Still uses safe branch deletion (merged only, unless combined with specific flags)
- Still handles errors gracefully

### Dry-Run Mode

The `--dry-run` flag shows what would be done without actually doing it:
- Lists all worktrees that would be removed
- Shows database branches that would be deleted
- Shows git branches that would be deleted
- No actual modifications performed
- Useful for validating cleanup scope

### Error Recovery

At each stage of cleanup:
1. Validate preconditions
2. Perform operation
3. Verify success
4. Log result
5. Continue even if individual operations fail
6. Report final statistics

No cascading failures - one failed removal doesn't prevent others.

## User Experience Enhancements

### Clear Visual Feedback

```
🗑️  Removing worktrees for issue #42...

Found 3 branches:
  🌿 issue-42-add-auth (has worktree) ✓
  🌿 42-auth-tests (has worktree) ✓
  🌿 feat/issue-42 (branch only)

Remove 2 worktree(s)? [Y/n]: y

✅ Removed: issue-42-add-auth
   📁 Worktree removed
   🗂️  Database branch cleaned up
   🌿 Branch deleted

✅ Removed: 42-auth-tests
   📁 Worktree removed
   🗂️  No database branch found
   🌿 Branch deleted

ℹ️  Skipped: feat/issue-42 (no worktree)

✅ Completed:
   📁 Worktrees removed: 2
   🌿 Branches deleted: 2
   ❌ Failed operations: 0
```

### Helpful Error Messages

- "Worktree not found - showing available worktrees"
- "Branch not fully merged - use --force to delete anyway"
- "Database branch deletion failed - you may need to clean up manually"
- "No worktrees found for issue #42 - searched patterns: issue-42, 42-*, feat-42"

### Performance Optimizations

- Parallel worktree validation where safe
- Batched database queries
- Cached branch listings
- Efficient pattern matching

## Success Metrics

### Functional Requirements
- 100% feature parity with `cleanup-worktree.sh`
- All 6 sub-issues completed and tested
- Safe cleanup with no data loss
- Clear user feedback at each step

### Quality Requirements
- >95% test coverage across all code
- Comprehensive mock factories for external dependencies
- Zero accidental data loss in production
- Graceful error handling and recovery

### User Experience
- Clear confirmation flows prevent mistakes
- Informative error messages aid troubleshooting
- Dry-run mode enables safe experimentation
- Batch operations save time
- Progress feedback for long operations

## Risk Mitigation

### Technical Risks

1. **Accidental Deletion**: Mitigate with comprehensive confirmations and dry-run mode
2. **Database State Inconsistency**: Mitigate with atomic operations and clear error messages
3. **Partial Cleanup**: Mitigate with independent operation handling and clear reporting

### Process Risks

1. **Scope Creep**: Strict adherence to bash script functionality
2. **Testing Complexity**: Early investment in mock factories
3. **User Confusion**: Clear documentation and helpful error messages

## Definition of Done

The `cleanup` command implementation is complete when:

1. All 6 sub-issues are implemented and merged
2. Full integration tests pass
3. Documentation is complete
4. Safety mechanisms tested thoroughly
5. User acceptance testing completed
6. All acceptance criteria met
7. Performance meets expectations
8. Can safely clean up worktrees created by start command

## Comparison with Bash Script

### Feature Parity Matrix

| Feature | Bash Script | TypeScript | Enhancement |
|---------|-------------|------------|-------------|
| List worktrees | ✓ | ✓ | Richer display |
| Single removal | ✓ | ✓ | Better errors |
| Issue-based | ✓ | ✓ | More patterns |
| Bulk removal | ✓ | ✓ | Better safety |
| Force flag | ✓ | ✓ | Same behavior |
| Dry-run | ✗ | ✓ | New feature |
| Database cleanup | ✓ | ✓ | Same behavior |
| Auto-detect | ✓ | ✓ | Same behavior |
| Confirmations | ✓ | ✓ | More granular |

### Improvements Over Bash

1. **Type Safety**: Compile-time checking prevents errors
2. **Testing**: Comprehensive unit and integration tests
3. **Error Handling**: Structured error handling with clear messages
4. **Dry-Run Mode**: New feature for safe experimentation
5. **Progress Feedback**: Better user experience for long operations
6. **Performance**: Potential for parallel operations
7. **Maintainability**: Modular TypeScript code vs monolithic bash

## File Structure After Implementation

```
src/
├── commands/
│   └── cleanup.ts                  # Main command implementation
├── lib/
│   ├── HatchboxManager.ts          # Extend with cleanupHatchbox()
│   ├── GitWorktreeManager.ts       # Already has removeWorktree()
│   ├── DatabaseManager.ts          # Extend with cleanup methods
│   └── GitHubService.ts            # Already exists (for issue lookup)
├── providers/
│   └── NeonProvider.ts             # New: Neon CLI integration
├── utils/
│   ├── git.ts                      # Extend with branch search
│   ├── database.ts                 # New: Database utilities
│   └── prompt.ts                   # Already exists (confirmations)
└── types/
    └── cleanup.ts                  # New: Cleanup-specific types

tests/
├── commands/
│   └── cleanup.test.ts
├── lib/
│   └── HatchboxManager.test.ts     # Extend with cleanup tests
├── providers/
│   └── NeonProvider.test.ts        # New
└── mocks/
    └── MockNeonProvider.ts         # New
```

## Integration with Existing Code

### Leverage Existing Services

```typescript
// Already implemented and ready to use:
HatchboxManager.listHatchboxes()          // List all hatchboxes
GitWorktreeManager.listWorktrees()        // List all worktrees
GitWorktreeManager.removeWorktree()       // Remove single worktree
GitWorktreeManager.isPRWorktree()         // Detect PR worktrees
GitWorktreeManager.isMainWorktree()       // Protect main worktree
```

### New Methods to Implement

```typescript
// HatchboxManager
async cleanupHatchbox(identifier: string): Promise<void>
async cleanupAllHatchboxes(options?: CleanupOptions): Promise<CleanupResult>
async cleanupHatchboxesByIssue(issueNumber: number): Promise<CleanupResult>

// DatabaseManager
async deleteBranch(branchName: string, options?: DeleteOptions): Promise<void>
async findPreviewBranch(branchName: string): Promise<string | null>

// git.ts utilities
async findBranchesForIssue(issueNumber: number): Promise<string[]>
async isBranchMerged(branchName: string): Promise<boolean>
```

## Command Line Examples

```bash
# List all worktrees
hb cleanup --list
hb cleanup -l

# Remove specific worktree
hb cleanup feature/my-feature
hb cleanup 42                      # Auto-detected as issue number

# Remove all worktrees for issue
hb cleanup --issue 42
hb cleanup -i 42

# Remove all worktrees
hb cleanup --all
hb cleanup -a

# With force flag (no confirmations)
hb cleanup --all --force
hb cleanup -af

# Dry-run mode
hb cleanup --all --dry-run
hb cleanup --issue 42 --dry-run

# Combined options
hb cleanup --issue 42 --force --dry-run
```

## Notes

- Each sub-issue should have its own PR
- Code review required for each PR
- Integration tests run after each merge
- Safety testing with real worktrees critical
- User documentation updated with each feature
- Database integration is handled by shared ResourceCleanup component

## Appendix: Bash Script Line References

### cleanup-worktree.sh

- **Usage/Help**: Lines 30-48
- **List Function**: Lines 51-64
- **Confirm Function**: Lines 67-81
- **Single Removal**: Lines 84-130
- **Find Issue Branches**: Lines 132-154
- **Issue-based Removal**: Lines 156-242
- **Bulk Removal**: Lines 244-318
- **Argument Parsing**: Lines 320-374
- **Auto-detection**: Lines 364-369

### neon-utils.sh

- **Branch Sanitization**: Lines 12-15
- **CLI Availability Check**: Lines 18-23
- **Authentication Check**: Lines 26-36
- **Branch Existence Check**: Lines 39-61
- **Preview Database Detection**: Lines 93-124
- **Database Branch Deletion**: Lines 204-259

### worktree-utils.sh

- **PR Worktree Detection**: Lines 16-19
- **PR Number Extraction**: Lines 22-29

## Dependencies Between Sub-Issues

```
Sub-Issue #1 (Command Structure)
    ├─> Sub-Issue #2 (List Worktrees)
    ├─> Sub-Issue #3 (Single Removal)
    │       ├─> Sub-Issue #4 (Issue-based)
    │       └─> Sub-Issue #5 (Bulk Removal)
    └─> Shared ResourceCleanup component [Can be parallel]
```

## Testing Strategy

### Unit Tests
- Option parsing and validation
- Branch search algorithms
- Confirmation logic
- Error handling paths

### Integration Tests
- Full cleanup workflows
- Database cleanup integration
- Multi-worktree scenarios
- Error recovery

### Safety Tests
- Main worktree protection
- Accidental deletion prevention
- Partial failure recovery
- Data integrity validation

### Performance Tests
- Large number of worktrees
- Parallel operations
- Database query efficiency
