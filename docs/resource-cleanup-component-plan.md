# ResourceCleanup Component Implementation Plan

## Overview

This document outlines the implementation plan for the shared **ResourceCleanup component** that provides core cleanup functionality for both the `finish` and `cleanup` commands. This component encapsulates all resource cleanup operations including worktree removal, dev server termination, branch deletion, and database cleanup.

## Goal

Create a robust, reusable component that handles all aspects of workspace resource cleanup with comprehensive error handling, rollback mechanisms, and support for dry-run mode. This component should be **independent** and usable by multiple commands.

## Architecture

### Core Responsibilities

The ResourceCleanup component is responsible for:

1. **Dev Server Termination** - Kill development servers on assigned ports
2. **Worktree Removal** - Remove Git worktrees safely
3. **Branch Deletion** - Delete local and optionally remote branches
4. **Database Cleanup** - Clean up database branches (Neon, Supabase, etc.)
5. **Error Handling** - Graceful failure handling with rollback
6. **Progress Reporting** - Clear feedback during operations
7. **Dry-Run Support** - Preview operations without executing

### Class Interface

```typescript
export class ResourceCleanup {
  constructor(
    private gitWorktree: GitWorktreeManager,
    private database?: DatabaseManager,
    private logger?: Logger
  ) {}

  // Main cleanup operations
  async cleanupWorktree(identifier: string, options?: CleanupOptions): Promise<CleanupResult>
  async terminateDevServer(port: number): Promise<boolean>
  async deleteBranch(branchName: string, options?: BranchDeleteOptions): Promise<boolean>
  async cleanupDatabase(branchName: string): Promise<boolean>

  // Batch operations
  async cleanupMultipleWorktrees(identifiers: string[], options?: CleanupOptions): Promise<CleanupResult[]>

  // Utility methods
  async detectDevServer(port: number): Promise<ProcessInfo | null>
  async validateCleanupSafety(identifier: string): Promise<SafetyCheck>
}

export interface CleanupOptions {
  dryRun?: boolean
  force?: boolean
  deleteBranch?: boolean
  keepDatabase?: boolean
  interactive?: boolean
}

export interface CleanupResult {
  identifier: string
  success: boolean
  operations: OperationResult[]
  errors: Error[]
  rollbackRequired?: boolean
}
```

## Implementation Details

### Sub-Component: Dev Server Termination

**Purpose**: Detect and terminate development servers running on assigned ports

**Key Logic to Port**:
```bash
# From merge-and-clean.sh lines 1092-1148
PORT_INFO=$(lsof -i:${DEV_SERVER_PORT} -P 2>/dev/null | grep LISTEN)
if [[ "$PROCESS_NAME" =~ ^(node|npm|pnpm|next|vite)$ ]]; then
  kill -9 "$DEV_SERVER_PID"
fi
```

**Implementation**:
- Cross-platform process detection (lsof on Unix, netstat on Windows)
- Process type validation (only kill dev servers)
- Graceful termination with fallback to force kill
- Port calculation logic (3000 + issue number)

### Sub-Component: Worktree Management

**Purpose**: Remove Git worktrees and handle associated cleanup

**Integration**:
- Uses existing `GitWorktreeManager.removeWorktree()` method
- Adds validation and error handling
- Supports batch operations
- Handles missing worktrees gracefully

### Sub-Component: Branch Deletion

**Purpose**: Delete local and remote branches with safety checks

**Safety Mechanisms**:
- Only delete merged branches by default (unless `--force`)
- Protect main/master/develop branches
- Confirm remote branch deletion
- Support dry-run mode

### Sub-Component: Database Cleanup

**Purpose**: Clean up database branches across different providers

**Provider Support**:
- Neon (immediate)
- Supabase (future)
- PlanetScale (future)
- Local databases (future)

**Special Handling**:
- Vercel preview database detection
- Database provider auto-detection
- Graceful degradation when unavailable
- Confirmation for preview databases

## Error Handling & Rollback Strategy

### Rollback Points

The ResourceCleanup component must support rollback at these points:

1. **Before any operations**: Clean state, no rollback needed
2. **After dev server termination**: Can restart if PID available
3. **After worktree removal**: Cannot rollback, but track failure
4. **After branch deletion**: Cannot rollback, but track failure
5. **After database cleanup**: Cannot rollback, but track failure

### Error Recovery Strategy

**Partial Failure Handling**:
- Each operation is independent
- One failure doesn't stop others (unless `--fail-fast`)
- Clear reporting of what succeeded vs failed
- Manual cleanup instructions for failed operations

**Error Types**:
- **Process not found**: Continue (dev server already stopped)
- **Worktree missing**: Continue (already removed)
- **Branch missing**: Continue (already deleted)
- **Database unavailable**: Continue with warning
- **Permission denied**: Fail with manual instructions

## Testing Strategy

### Unit Tests
- Mock all external dependencies (Git, process management, database)
- Test each cleanup operation independently
- Test error scenarios and recovery
- Test rollback mechanisms
- Cross-platform compatibility

### Integration Tests
- Real Git repositories (temporary)
- Real process management (controlled test processes)
- Database operations (mocked by default)
- End-to-end cleanup workflows

### Safety Tests
- Main worktree protection
- Process type validation
- Database safety checks
- Dry-run accuracy

## Files to Create

```
src/
├── lib/
│   ├── ResourceCleanup.ts           # Main component
│   ├── ResourceCleanup.test.ts      # Comprehensive tests
│   └── process/
│       ├── ProcessManager.ts        # Cross-platform process management
│       └── ProcessManager.test.ts
└── types/
    ├── cleanup.ts                   # Type definitions
    └── process.ts                   # Process-related types

tests/
├── lib/
│   └── ResourceCleanup.test.ts
├── mocks/
│   ├── MockProcessManager.ts
│   ├── MockGitWorktreeManager.ts
│   └── MockDatabaseManager.ts
└── fixtures/
    └── cleanup-scenarios/           # Test data for various scenarios
```

## Dependencies

### Required Dependencies
- `GitWorktreeManager` (already exists)
- `DatabaseManager` (already exists, may need extension)
- Cross-platform process management utilities

### Optional Dependencies
- `Logger` for operation tracking
- Progress reporting utilities

## Usage Examples

### By Finish Command
```typescript
const resourceCleanup = new ResourceCleanup(gitWorktree, database, logger);

// After successful merge
const result = await resourceCleanup.cleanupWorktree(identifier, {
  deleteBranch: true,
  interactive: false
});

if (!result.success) {
  // Handle partial failure
  console.error('Cleanup failed:', result.errors);
}
```

### By Cleanup Command
```typescript
const resourceCleanup = new ResourceCleanup(gitWorktree, database, logger);

// Single cleanup with confirmation
const result = await resourceCleanup.cleanupWorktree(identifier, {
  interactive: true,
  dryRun: options.dryRun,
  force: options.force
});

// Batch cleanup
const results = await resourceCleanup.cleanupMultipleWorktrees(identifiers, {
  deleteBranch: true,
  interactive: !options.force
});
```

## Platform Compatibility

### Process Management
- **macOS/Linux**: Use `lsof` and `ps` commands
- **Windows**: Use `netstat` and `tasklist` commands
- Unified interface through ProcessManager class

### File System Operations
- Use Node.js built-in `fs` module
- Handle path separators correctly
- Proper permission handling

## Success Metrics

### Functionality
- Handles all cleanup scenarios from bash scripts
- Works reliably across platforms
- Provides clear feedback and error messages
- Supports both interactive and automated modes

### Quality
- >95% test coverage
- Zero data loss during operations
- Graceful handling of all error scenarios
- Performance comparable to bash scripts

### Usability
- Clear operation progress reporting
- Helpful error messages with recovery suggestions
- Dry-run mode accurately previews operations
- Configurable safety levels

## Timeline

**Estimated Effort**: 3-4 days

### Development Phases

**Day 1**: Core architecture and interfaces **[Labels: `resource-cleanup:phase-1`]**
- Define TypeScript interfaces
- Create main ResourceCleanup class structure
- Implement ProcessManager for cross-platform support

**Day 2**: Core cleanup operations **[Labels: `resource-cleanup:phase-1`]**
- Dev server termination
- Worktree removal integration
- Branch deletion with safety checks

**Day 3**: Database integration and error handling **[Labels: `resource-cleanup:phase-2`]**
- Database cleanup integration
- Comprehensive error handling
- Rollback mechanisms

**Day 4**: Testing and polish **[Labels: `resource-cleanup:phase-2`]**
- Comprehensive test suite
- Integration testing
- Documentation and examples

## Integration Timeline

### Parallel Development
The ResourceCleanup component can be developed **in parallel** with both finish and cleanup commands since it has clearly defined interfaces.

### Integration Points
1. **Finish Command**: Integrates after successful merge operations
2. **Cleanup Command**: Uses for all cleanup modes
3. **Future Commands**: Can reuse for any workspace cleanup needs

## Notes

- This component is designed to be the **single source of truth** for all cleanup operations
- Both finish and cleanup commands depend on this component
- Database provider abstraction allows future extension
- Comprehensive error handling prevents data loss
- Dry-run support enables safe experimentation

This shared component approach eliminates code duplication while providing a robust, well-tested cleanup system that both commands can rely on.