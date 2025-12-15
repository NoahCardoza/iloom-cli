import { describe, it, expect } from 'vitest'
import { formatLoomForJson, formatLoomsForJson } from './loom-formatter.js'
import type { GitWorktree } from '../types/worktree.js'

describe('formatLoomForJson', () => {
  /**
   * Factory to create realistic GitWorktree objects mimicking actual git worktree list output.
   * Default values represent a typical secondary worktree state.
   */
  const createWorktree = (overrides: Partial<GitWorktree> = {}): GitWorktree => ({
    path: '/Users/dev/projects/myapp-looms/issue-123__feature-work',
    branch: 'issue-123__feature-work',
    commit: 'abc123def456789012345678901234567890abcd',
    bare: false,
    detached: false,
    locked: false,
    ...overrides,
  })

  /**
   * Factory for creating worktrees with realistic paths that match actual git worktree output.
   * Useful for testing path-based detection (PR suffix, main worktree matching).
   */
  const createRealisticWorktree = (config: {
    basePath?: string
    projectName?: string
    branchName: string
    prNumber?: number
    commit?: string
    bare?: boolean
    detached?: boolean
    locked?: boolean
    lockReason?: string
  }): GitWorktree => {
    const basePath = config.basePath ?? '/Users/dev/projects'
    const projectName = config.projectName ?? 'myapp'

    let path = `${basePath}/${projectName}-looms/${config.branchName}`
    if (config.prNumber) {
      path = `${path}_pr_${config.prNumber}`
    }

    return {
      path,
      branch: config.branchName,
      commit: config.commit ?? 'a1b2c3d4e5f6789012345678901234567890abcd',
      bare: config.bare ?? false,
      detached: config.detached ?? false,
      locked: config.locked ?? false,
      ...(config.lockReason ? { lockReason: config.lockReason } : {}),
    }
  }

  describe('isMainWorktree detection', () => {
    it('should return true when worktree path matches mainWorktreePath', () => {
      const mainPath = '/Users/dev/projects/myapp'
      const worktree = createWorktree({ path: mainPath, branch: 'main' })
      const result = formatLoomForJson(worktree, mainPath)
      expect(result.isMainWorktree).toBe(true)
    })

    it('should return false when worktree path does not match mainWorktreePath', () => {
      const worktree = createRealisticWorktree({ branchName: 'issue-456__add-feature' })
      const result = formatLoomForJson(worktree, '/Users/dev/projects/myapp')
      expect(result.isMainWorktree).toBe(false)
    })

    it('should return false when mainWorktreePath is not provided', () => {
      const worktree = createWorktree({ path: '/Users/dev/projects/myapp', branch: 'main' })
      const result = formatLoomForJson(worktree)
      expect(result.isMainWorktree).toBe(false)
    })

    it('should correctly identify main worktree with realistic paths', () => {
      const mainPath = '/Users/adam/Documents/Projects/iloom-cli'
      const mainWorktree = createWorktree({
        path: mainPath,
        branch: 'main',
        commit: 'e71c676abc123def456789012345678901234567',
      })
      const featureWorktree = createRealisticWorktree({
        basePath: '/Users/adam/Documents/Projects',
        projectName: 'iloom-cli',
        branchName: 'issue-269__json-formatter',
      })

      const mainResult = formatLoomForJson(mainWorktree, mainPath)
      const featureResult = formatLoomForJson(featureWorktree, mainPath)

      expect(mainResult.isMainWorktree).toBe(true)
      expect(featureResult.isMainWorktree).toBe(false)
    })
  })

  describe('type detection', () => {
    it('should detect PR type from _pr_N path suffix', () => {
      const worktree = createRealisticWorktree({
        branchName: 'issue-123__feature',
        prNumber: 456,
      })
      const result = formatLoomForJson(worktree)
      expect(result.type).toBe('pr')
    })

    it('should detect issue type from issue-N branch pattern', () => {
      const worktree = createRealisticWorktree({ branchName: 'issue-123__feature' })
      const result = formatLoomForJson(worktree)
      expect(result.type).toBe('issue')
    })

    it('should detect issue type from alphanumeric pattern (MARK-1)', () => {
      const worktree = createRealisticWorktree({ branchName: 'issue-MARK-1__feature' })
      const result = formatLoomForJson(worktree)
      expect(result.type).toBe('issue')
    })

    it('should default to branch type when no patterns match', () => {
      const worktree = createWorktree({
        path: '/Users/dev/projects/myapp',
        branch: 'main',
      })
      const result = formatLoomForJson(worktree)
      expect(result.type).toBe('branch')
    })

    describe('branch naming pattern variations', () => {
      it.each([
        // Standard issue patterns
        ['issue-42__fix-login', 'issue'],
        ['issue-1__initial-setup', 'issue'],
        ['issue-99999__large-number', 'issue'],

        // Linear-style alphanumeric IDs
        ['issue-PROJ-123__implement-feature', 'issue'],
        ['issue-ABC-1__short-prefix', 'issue'],
        ['issue-MYAPP-9999__long-id', 'issue'],

        // Old format (issue-N-slug)
        ['issue-25-add-tests', 'issue'],
        ['issue-1-init', 'issue'],

        // Conventional commit prefixes (should be 'branch' type - no issue pattern)
        ['feat/add-dark-mode', 'branch'],
        ['fix/login-bug', 'branch'],
        ['chore/update-deps', 'branch'],
        ['refactor/cleanup-code', 'branch'],
        ['docs/update-readme', 'branch'],
        ['test/add-coverage', 'branch'],
        ['hotfix/critical-bug', 'branch'],
        ['release/v1.0.0', 'branch'],

        // Main/default branches
        ['main', 'branch'],
        ['master', 'branch'],
        ['develop', 'branch'],
        ['development', 'branch'],

        // Feature branches without issue numbers
        ['feature-dark-mode', 'branch'],
        ['add-json-formatter', 'branch'],
        ['wip-testing', 'branch'],
      ])('should detect type for branch "%s" as "%s"', (branchName, expectedType) => {
        const worktree = createWorktree({
          path: `/Users/dev/projects/myapp-looms/${branchName}`,
          branch: branchName,
        })
        const result = formatLoomForJson(worktree)
        expect(result.type).toBe(expectedType)
      })
    })

    describe('PR detection with various path patterns', () => {
      it.each([
        // Standard PR suffix patterns
        ['/projects/myapp-looms/issue-123__feature_pr_1', 'pr'],
        ['/projects/myapp-looms/issue-456__fix-bug_pr_99', 'pr'],
        ['/projects/myapp-looms/issue-PROJ-789__new-feature_pr_1000', 'pr'],

        // Large PR numbers
        ['/projects/myapp-looms/issue-1__init_pr_99999', 'pr'],

        // No PR suffix - should be issue type
        ['/projects/myapp-looms/issue-123__feature', 'issue'],

        // Path that looks like PR but branch has issue pattern
        ['/projects/myapp-looms/issue-42__test', 'issue'],
      ])('should detect type for path "%s" as "%s"', (path, expectedType) => {
        const worktree = createWorktree({
          path,
          branch: 'issue-123__feature', // Branch always has issue pattern
        })
        const result = formatLoomForJson(worktree)
        expect(result.type).toBe(expectedType)
      })
    })
  })

  describe('pr_numbers extraction', () => {
    it('should extract PR number from path suffix for PR type', () => {
      const worktree = createRealisticWorktree({
        branchName: 'issue-123__feature',
        prNumber: 456,
      })
      const result = formatLoomForJson(worktree)
      expect(result.pr_numbers).toEqual(['456'])
    })

    it('should return empty pr_numbers for issue type', () => {
      const worktree = createRealisticWorktree({ branchName: 'issue-123__feature' })
      const result = formatLoomForJson(worktree)
      expect(result.pr_numbers).toEqual([])
    })

    it('should return empty pr_numbers for branch type', () => {
      const worktree = createWorktree({
        path: '/Users/dev/projects/myapp',
        branch: 'main',
      })
      const result = formatLoomForJson(worktree)
      expect(result.pr_numbers).toEqual([])
    })

    it.each([
      // Various PR number sizes
      [1, '1'],
      [99, '99'],
      [123, '123'],
      [9999, '9999'],
      [99999, '99999'],
    ])('should extract PR number %d as string "%s"', (prNum, expectedStr) => {
      const worktree = createRealisticWorktree({
        branchName: 'issue-42__feature',
        prNumber: prNum,
      })
      const result = formatLoomForJson(worktree)
      expect(result.pr_numbers).toEqual([expectedStr])
    })
  })

  describe('issue_numbers extraction', () => {
    it('should extract numeric issue number from branch for issue type', () => {
      const worktree = createRealisticWorktree({ branchName: 'issue-42__fix-bug' })
      const result = formatLoomForJson(worktree)
      expect(result.issue_numbers).toEqual(['42'])
      expect(result.pr_numbers).toEqual([])
    })

    it('should extract alphanumeric issue ID (Linear-style) for issue type', () => {
      const worktree = createRealisticWorktree({ branchName: 'issue-PROJ-123__implement-feature' })
      const result = formatLoomForJson(worktree)
      expect(result.issue_numbers).toEqual(['PROJ-123'])
      expect(result.pr_numbers).toEqual([])
    })

    it('should return empty issue_numbers for branch type', () => {
      const worktree = createWorktree({
        path: '/Users/dev/projects/myapp',
        branch: 'main',
      })
      const result = formatLoomForJson(worktree)
      expect(result.issue_numbers).toEqual([])
      expect(result.pr_numbers).toEqual([])
    })

    it('should handle old format issue branch (issue-N-slug)', () => {
      const worktree = createRealisticWorktree({ branchName: 'issue-25-add-tests' })
      const result = formatLoomForJson(worktree)
      expect(result.issue_numbers).toEqual(['25'])
      expect(result.pr_numbers).toEqual([])
    })

    it('should return empty issue_numbers for PR type (pr_numbers populated instead)', () => {
      const worktree = createRealisticWorktree({
        branchName: 'issue-123__feature',
        prNumber: 456,
      })
      const result = formatLoomForJson(worktree)
      expect(result.issue_numbers).toEqual([])
      expect(result.pr_numbers).toEqual(['456'])
    })

    describe('issue ID format variations', () => {
      it.each([
        // New format with double underscore
        ['issue-1__setup', '1'],
        ['issue-42__fix-bug', '42'],
        ['issue-999__large-number', '999'],
        ['issue-12345__very-large', '12345'],

        // Linear-style alphanumeric IDs
        ['issue-PROJ-1__feature', 'PROJ-1'],
        ['issue-ABC-123__work', 'ABC-123'],
        ['issue-MYAPP-9999__long', 'MYAPP-9999'],
        ['issue-XY-1__short-prefix', 'XY-1'],

        // Old format with single dash
        ['issue-1-init', '1'],
        ['issue-42-fix', '42'],
        ['issue-123-feature', '123'],
      ])('should extract issue number from "%s" as "%s"', (branchName, expectedIssue) => {
        const worktree = createRealisticWorktree({ branchName })
        const result = formatLoomForJson(worktree)
        expect(result.issue_numbers).toEqual([expectedIssue])
        expect(result.type).toBe('issue')
      })
    })
  })

  describe('field mapping', () => {
    it('should use branch as name', () => {
      const worktree = createRealisticWorktree({ branchName: 'issue-42__feature-test' })
      const result = formatLoomForJson(worktree)
      expect(result.name).toBe('issue-42__feature-test')
    })

    it('should use path as name when branch is empty', () => {
      const worktree = createWorktree({
        branch: '',
        path: '/Users/dev/projects/myapp-looms/orphan-worktree',
      })
      const result = formatLoomForJson(worktree)
      expect(result.name).toBe('/Users/dev/projects/myapp-looms/orphan-worktree')
    })

    it('should handle null worktreePath when bare is true', () => {
      const worktree = createWorktree({
        bare: true,
        path: '/Users/dev/projects/myapp.git',
        branch: 'main',
      })
      const result = formatLoomForJson(worktree)
      expect(result.worktreePath).toBeNull()
    })

    it('should return path as worktreePath when not bare', () => {
      const worktree = createRealisticWorktree({ branchName: 'issue-42__feature' })
      const result = formatLoomForJson(worktree)
      expect(result.worktreePath).toBe('/Users/dev/projects/myapp-looms/issue-42__feature')
    })

    it('should return branch as branch field', () => {
      const worktree = createRealisticWorktree({ branchName: 'issue-42__my-branch' })
      const result = formatLoomForJson(worktree)
      expect(result.branch).toBe('issue-42__my-branch')
    })

    it('should return null for branch when empty', () => {
      const worktree = createWorktree({ branch: '' })
      const result = formatLoomForJson(worktree)
      expect(result.branch).toBeNull()
    })
  })

  describe('detached HEAD states', () => {
    it('should handle detached HEAD with branch set to HEAD', () => {
      const worktree = createWorktree({
        path: '/Users/dev/projects/myapp-looms/detached-state',
        branch: 'HEAD',
        commit: 'abc123def456789012345678901234567890abcd',
        detached: true,
      })
      const result = formatLoomForJson(worktree)
      expect(result.branch).toBe('HEAD')
      expect(result.name).toBe('HEAD')
      expect(result.type).toBe('branch') // No issue pattern in "HEAD"
      expect(result.issue_numbers).toEqual([])
      expect(result.pr_numbers).toEqual([])
    })

    it('should handle detached HEAD from bisect operation', () => {
      const worktree = createWorktree({
        path: '/Users/dev/projects/myapp',
        branch: 'HEAD',
        commit: 'def456abc123789012345678901234567890abcd',
        detached: true,
        bare: false,
      })
      const result = formatLoomForJson(worktree)
      expect(result.type).toBe('branch')
      expect(result.worktreePath).toBe('/Users/dev/projects/myapp')
    })

    it('should correctly identify main worktree even when detached', () => {
      const mainPath = '/Users/dev/projects/myapp'
      const worktree = createWorktree({
        path: mainPath,
        branch: 'HEAD',
        detached: true,
      })
      const result = formatLoomForJson(worktree, mainPath)
      expect(result.isMainWorktree).toBe(true)
    })
  })

  describe('bare repositories', () => {
    it('should set worktreePath to null for bare repository', () => {
      const worktree = createWorktree({
        path: '/Users/dev/projects/myapp.git',
        branch: 'main',
        bare: true,
      })
      const result = formatLoomForJson(worktree)
      expect(result.worktreePath).toBeNull()
      expect(result.branch).toBe('main')
      expect(result.name).toBe('main')
    })

    it('should handle bare repo with custom default branch', () => {
      const worktree = createWorktree({
        path: '/Users/dev/projects/myapp.git',
        branch: 'develop',
        bare: true,
      })
      const result = formatLoomForJson(worktree)
      expect(result.worktreePath).toBeNull()
      expect(result.branch).toBe('develop')
      expect(result.type).toBe('branch')
    })

    it('should correctly identify bare repo as main worktree when path matches', () => {
      const barePath = '/Users/dev/projects/myapp.git'
      const worktree = createWorktree({
        path: barePath,
        branch: 'main',
        bare: true,
      })
      const result = formatLoomForJson(worktree, barePath)
      expect(result.isMainWorktree).toBe(true)
      expect(result.worktreePath).toBeNull()
    })
  })

  describe('locked worktrees', () => {
    it('should handle locked worktree without reason', () => {
      const worktree = createRealisticWorktree({
        branchName: 'issue-42__in-progress',
        locked: true,
      })
      const result = formatLoomForJson(worktree)
      expect(result.type).toBe('issue')
      expect(result.issue_numbers).toEqual(['42'])
      // Note: locked status is not exposed in LoomJsonOutput, but should not break formatting
    })

    it('should handle locked worktree with lock reason', () => {
      const worktree = createRealisticWorktree({
        branchName: 'issue-123__critical-fix',
        locked: true,
        lockReason: 'Locked for deployment review',
      })
      const result = formatLoomForJson(worktree)
      expect(result.type).toBe('issue')
      expect(result.issue_numbers).toEqual(['123'])
      expect(result.worktreePath).toBe('/Users/dev/projects/myapp-looms/issue-123__critical-fix')
    })

    it('should handle locked PR worktree', () => {
      const worktree = createRealisticWorktree({
        branchName: 'issue-789__feature',
        prNumber: 100,
        locked: true,
        lockReason: 'PR under review',
      })
      const result = formatLoomForJson(worktree)
      expect(result.type).toBe('pr')
      expect(result.pr_numbers).toEqual(['100'])
      expect(result.issue_numbers).toEqual([])
    })
  })

  describe('edge cases and realistic git output scenarios', () => {
    it('should handle worktree with empty commit hash', () => {
      const worktree = createWorktree({
        path: '/Users/dev/projects/myapp',
        branch: 'main',
        commit: '',
      })
      const result = formatLoomForJson(worktree)
      expect(result.branch).toBe('main')
      expect(result.type).toBe('branch')
    })

    it('should handle worktree paths with spaces', () => {
      const worktree = createWorktree({
        path: '/Users/dev/My Projects/myapp-looms/issue-42__feature',
        branch: 'issue-42__feature',
      })
      const result = formatLoomForJson(worktree)
      expect(result.worktreePath).toBe('/Users/dev/My Projects/myapp-looms/issue-42__feature')
      expect(result.type).toBe('issue')
    })

    it('should handle worktree paths with special characters', () => {
      const worktree = createWorktree({
        path: '/Users/dev/projects/my-app@2.0-looms/issue-42__feature',
        branch: 'issue-42__feature',
      })
      const result = formatLoomForJson(worktree)
      expect(result.worktreePath).toBe('/Users/dev/projects/my-app@2.0-looms/issue-42__feature')
    })

    it('should handle branch names with forward slashes (converted by git worktree)', () => {
      // When a branch like "feat/add-feature" is used with worktrees,
      // the path typically has the slash converted
      const worktree = createWorktree({
        path: '/Users/dev/projects/myapp-looms/feat-add-feature',
        branch: 'feat/add-feature', // Original branch name preserved
      })
      const result = formatLoomForJson(worktree)
      expect(result.branch).toBe('feat/add-feature')
      expect(result.name).toBe('feat/add-feature')
      expect(result.type).toBe('branch')
    })

    it('should handle very long branch names', () => {
      const longSlug = 'a'.repeat(100)
      const branchName = `issue-42__${longSlug}`
      const worktree = createRealisticWorktree({ branchName })
      const result = formatLoomForJson(worktree)
      expect(result.branch).toBe(branchName)
      expect(result.issue_numbers).toEqual(['42'])
    })

    it('should handle worktree with all flags set', () => {
      const worktree = createWorktree({
        path: '/Users/dev/projects/myapp.git',
        branch: 'main',
        commit: 'abc123',
        bare: true,
        detached: true,
        locked: true,
        lockReason: 'Test lock',
      })
      const result = formatLoomForJson(worktree)
      expect(result.worktreePath).toBeNull() // bare=true overrides
      expect(result.branch).toBe('main')
    })

    it('should handle Windows-style paths', () => {
      const worktree = createWorktree({
        path: 'C:\\Users\\dev\\projects\\myapp-looms\\issue-42__feature',
        branch: 'issue-42__feature',
      })
      const result = formatLoomForJson(worktree)
      expect(result.worktreePath).toBe('C:\\Users\\dev\\projects\\myapp-looms\\issue-42__feature')
      expect(result.type).toBe('issue')
    })

    it('should handle network/UNC paths', () => {
      const worktree = createWorktree({
        path: '//server/share/projects/myapp-looms/issue-42__feature',
        branch: 'issue-42__feature',
      })
      const result = formatLoomForJson(worktree)
      expect(result.worktreePath).toBe('//server/share/projects/myapp-looms/issue-42__feature')
    })
  })
})

describe('formatLoomsForJson', () => {
  it('should transform array of worktrees to JSON schema with correct issue/pr numbers', () => {
    const mainPath = '/Users/dev/projects/myapp'
    const worktrees: GitWorktree[] = [
      {
        path: '/Users/dev/projects/myapp-looms/issue-1__feature',
        branch: 'issue-1__feature',
        commit: 'abc123def456789012345678901234567890abcd',
        bare: false,
        detached: false,
        locked: false,
      },
      {
        path: mainPath,
        branch: 'main',
        commit: 'def456abc123789012345678901234567890abcd',
        bare: false,
        detached: false,
        locked: false,
      },
      {
        path: '/Users/dev/projects/myapp-looms/issue-42__feature_pr_99',
        branch: 'issue-42__feature',
        commit: 'ghi789abc123def456789012345678901234abcd',
        bare: false,
        detached: false,
        locked: false,
      },
    ]

    const result = formatLoomsForJson(worktrees, mainPath)

    expect(result).toHaveLength(3)
    // Issue type - issue_numbers populated, pr_numbers empty, not main
    expect(result[0].name).toBe('issue-1__feature')
    expect(result[0].type).toBe('issue')
    expect(result[0].issue_numbers).toEqual(['1'])
    expect(result[0].pr_numbers).toEqual([])
    expect(result[0].isMainWorktree).toBe(false)
    // Branch type (main) - both empty, IS main worktree
    expect(result[1].name).toBe('main')
    expect(result[1].type).toBe('branch')
    expect(result[1].issue_numbers).toEqual([])
    expect(result[1].pr_numbers).toEqual([])
    expect(result[1].isMainWorktree).toBe(true)
    // PR type - pr_numbers populated, issue_numbers empty, not main
    expect(result[2].name).toBe('issue-42__feature')
    expect(result[2].type).toBe('pr')
    expect(result[2].issue_numbers).toEqual([])
    expect(result[2].pr_numbers).toEqual(['99'])
    expect(result[2].isMainWorktree).toBe(false)
  })

  it('should return empty array for empty input', () => {
    const result = formatLoomsForJson([])
    expect(result).toEqual([])
  })

  describe('realistic multi-worktree scenarios', () => {
    it('should handle typical iloom workspace with multiple active issues', () => {
      const mainPath = '/Users/adam/Documents/Projects/iloom-cli'
      const worktrees: GitWorktree[] = [
        // Main worktree
        {
          path: mainPath,
          branch: 'main',
          commit: 'e71c676abc123def456789012345678901234567',
          bare: false,
          detached: false,
          locked: false,
        },
        // Active issue worktree
        {
          path: '/Users/adam/Documents/Projects/iloom-cli-looms/issue-269__json-formatter',
          branch: 'issue-269__json-formatter',
          commit: 'bee253dabc123def456789012345678901234567',
          bare: false,
          detached: false,
          locked: false,
        },
        // PR worktree
        {
          path: '/Users/adam/Documents/Projects/iloom-cli-looms/issue-254__dotenv-flow_pr_255',
          branch: 'issue-254__dotenv-flow',
          commit: 'aa52504abc123def456789012345678901234567',
          bare: false,
          detached: false,
          locked: false,
        },
        // Linear-style issue
        {
          path: '/Users/adam/Documents/Projects/iloom-cli-looms/issue-ILOOM-42__new-feature',
          branch: 'issue-ILOOM-42__new-feature',
          commit: 'acc379babc123def456789012345678901234567',
          bare: false,
          detached: false,
          locked: false,
        },
      ]

      const result = formatLoomsForJson(worktrees, mainPath)

      expect(result).toHaveLength(4)

      // Main worktree
      expect(result[0]).toEqual({
        name: 'main',
        worktreePath: mainPath,
        branch: 'main',
        type: 'branch',
        issue_numbers: [],
        pr_numbers: [],
        isMainWorktree: true,
        description: null,
        created_at: null,
        issueTracker: null,
        colorHex: null,
        projectPath: null,
        issueUrls: {},
        prUrls: {},
      })

      // Issue worktree
      expect(result[1]).toEqual({
        name: 'issue-269__json-formatter',
        worktreePath: '/Users/adam/Documents/Projects/iloom-cli-looms/issue-269__json-formatter',
        branch: 'issue-269__json-formatter',
        type: 'issue',
        issue_numbers: ['269'],
        pr_numbers: [],
        isMainWorktree: false,
        description: null,
        created_at: null,
        issueTracker: null,
        colorHex: null,
        projectPath: null,
        issueUrls: {},
        prUrls: {},
      })

      // PR worktree
      expect(result[2]).toEqual({
        name: 'issue-254__dotenv-flow',
        worktreePath: '/Users/adam/Documents/Projects/iloom-cli-looms/issue-254__dotenv-flow_pr_255',
        branch: 'issue-254__dotenv-flow',
        type: 'pr',
        issue_numbers: [],
        pr_numbers: ['255'],
        isMainWorktree: false,
        description: null,
        created_at: null,
        issueTracker: null,
        colorHex: null,
        projectPath: null,
        issueUrls: {},
        prUrls: {},
      })

      // Linear-style issue
      expect(result[3]).toEqual({
        name: 'issue-ILOOM-42__new-feature',
        worktreePath: '/Users/adam/Documents/Projects/iloom-cli-looms/issue-ILOOM-42__new-feature',
        branch: 'issue-ILOOM-42__new-feature',
        type: 'issue',
        issue_numbers: ['ILOOM-42'],
        pr_numbers: [],
        isMainWorktree: false,
        description: null,
        created_at: null,
        issueTracker: null,
        colorHex: null,
        projectPath: null,
        issueUrls: {},
        prUrls: {},
      })
    })

    it('should handle mixed worktree states (detached, locked, bare)', () => {
      const worktrees: GitWorktree[] = [
        // Main bare repo
        {
          path: '/Users/dev/projects/myapp.git',
          branch: 'main',
          commit: 'abc123',
          bare: true,
          detached: false,
          locked: false,
        },
        // Detached HEAD worktree
        {
          path: '/Users/dev/projects/myapp-looms/bisect-test',
          branch: 'HEAD',
          commit: 'def456',
          bare: false,
          detached: true,
          locked: false,
        },
        // Locked issue worktree
        {
          path: '/Users/dev/projects/myapp-looms/issue-100__critical',
          branch: 'issue-100__critical',
          commit: 'ghi789',
          bare: false,
          detached: false,
          locked: true,
          lockReason: 'Under review',
        },
      ]

      const result = formatLoomsForJson(worktrees)

      expect(result).toHaveLength(3)

      // Bare repo - worktreePath null
      expect(result[0].worktreePath).toBeNull()
      expect(result[0].type).toBe('branch')

      // Detached - has path, type is branch
      expect(result[1].worktreePath).toBe('/Users/dev/projects/myapp-looms/bisect-test')
      expect(result[1].type).toBe('branch')
      expect(result[1].branch).toBe('HEAD')

      // Locked - still formatted normally
      expect(result[2].type).toBe('issue')
      expect(result[2].issue_numbers).toEqual(['100'])
    })

    it('should handle worktrees without mainWorktreePath provided', () => {
      const worktrees: GitWorktree[] = [
        {
          path: '/Users/dev/projects/myapp',
          branch: 'main',
          commit: 'abc123',
          bare: false,
          detached: false,
          locked: false,
        },
        {
          path: '/Users/dev/projects/myapp-looms/issue-1__feature',
          branch: 'issue-1__feature',
          commit: 'def456',
          bare: false,
          detached: false,
          locked: false,
        },
      ]

      // No mainWorktreePath provided
      const result = formatLoomsForJson(worktrees)

      expect(result).toHaveLength(2)
      // All should have isMainWorktree: false when not provided
      expect(result[0].isMainWorktree).toBe(false)
      expect(result[1].isMainWorktree).toBe(false)
    })
  })
})
