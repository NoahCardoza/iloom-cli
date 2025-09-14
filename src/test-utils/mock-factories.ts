import { vi } from 'vitest'
import type { MockOptions } from '../types/index.js'

/**
 * Mock factory for Git CLI operations
 */
export class MockGitProvider {
  private scenarios = new Map<string, unknown>()

  setupWorktreeScenario(scenario: MockOptions['scenario'], data?: unknown): void {
    this.scenarios.set('worktree', { scenario, data })
  }

  setupBranchScenario(scenario: MockOptions['scenario'], data?: unknown): void {
    this.scenarios.set('branch', { scenario, data })
  }

  mockCommand(_command: string, response: string | Error): ReturnType<typeof vi.fn> {
    return vi.fn().mockImplementation(() => {
      if (response instanceof Error) {
        throw response
      }
      return Promise.resolve({ stdout: response, stderr: '', exitCode: 0 })
    })
  }

  verifyCommandCalled(mockFn: ReturnType<typeof vi.fn>, _command: string, times = 1): void {
    // Note: This is a placeholder - actual implementation would use vitest expect
    // For now, just verify mockFn was called the correct number of times
    if (mockFn.mock.calls.length !== times) {
      throw new Error(`Expected ${times} calls, got ${mockFn.mock.calls.length}`)
    }
  }

  reset(): void {
    this.scenarios.clear()
  }
}

/**
 * Mock factory for GitHub CLI operations
 */
export class MockGitHubProvider {
  private responses = new Map<string, unknown>()

  setupIssueResponse(issueNumber: number, data: unknown): void {
    this.responses.set(`issue-${issueNumber}`, data)
  }

  setupPRResponse(prNumber: number, data: unknown): void {
    this.responses.set(`pr-${prNumber}`, data)
  }

  mockGhCommand(_command: string, response: unknown): ReturnType<typeof vi.fn> {
    return vi.fn().mockResolvedValue(response)
  }

  reset(): void {
    this.responses.clear()
  }
}

/**
 * Mock factory for Neon CLI operations
 */
export class MockNeonProvider {
  private branches = new Map<string, unknown>()

  setupBranchResponse(branchName: string, data: unknown): void {
    this.branches.set(branchName, data)
  }

  mockNeonCommand(_operation: string, response: unknown): ReturnType<typeof vi.fn> {
    return vi.fn().mockResolvedValue(response)
  }

  reset(): void {
    this.branches.clear()
  }
}

/**
 * Mock factory for Claude CLI operations
 */
export class MockClaudeProvider {
  private contexts = new Map<string, unknown>()

  setupContextResponse(contextId: string, data: unknown): void {
    this.contexts.set(contextId, data)
  }

  mockClaudeCommand(_command: string, response: unknown): ReturnType<typeof vi.fn> {
    return vi.fn().mockResolvedValue(response)
  }

  reset(): void {
    this.contexts.clear()
  }
}

/**
 * Mock factory for file system operations
 */
export class MockFileSystem {
  private files = new Map<string, string>()
  private directories = new Set<string>()

  setupFile(path: string, content: string): void {
    this.files.set(path, content)
  }

  setupDirectory(path: string): void {
    this.directories.add(path)
  }

  mockReadFile(_path: string, content?: string): ReturnType<typeof vi.fn> {
    return vi.fn().mockResolvedValue(content ?? this.files.get(_path) ?? '')
  }

  mockWriteFile(_path: string): ReturnType<typeof vi.fn> {
    return vi.fn().mockImplementation((filePath: string, data: string) => {
      this.files.set(filePath, data)
      return Promise.resolve()
    })
  }

  reset(): void {
    this.files.clear()
    this.directories.clear()
  }
}

/**
 * Test fixtures with realistic data
 */
export class TestFixtures {
  static readonly SAMPLE_ISSUE = {
    number: 25,
    title: 'Add user authentication',
    body: 'Implement OAuth login flow with GitHub',
    state: 'open' as const,
    labels: ['enhancement', 'auth'],
    assignees: ['acreeger'],
    url: 'https://github.com/acreeger/hatchbox-ai/issues/25',
  }

  static readonly SAMPLE_PR = {
    number: 30,
    title: 'Fix API timeout bug',
    body: 'Increase timeout for slow API responses',
    state: 'open' as const,
    branch: 'fix/api-timeout',
    baseBranch: 'main',
    url: 'https://github.com/acreeger/hatchbox-ai/pull/30',
    isDraft: false,
  }

  static readonly SAMPLE_WORKTREE = {
    path: '/tmp/test-workspace-25',
    branch: 'feat/issue-25-add-auth',
    commit: 'abc123',
    isPR: false,
    issueNumber: 25,
    port: 3025,
  }

  static async createTemporaryRepo(): Promise<string> {
    // Implementation would create actual temporary git repo for integration tests
    return '/tmp/test-repo-' + Date.now()
  }

  static async createWorkspaceScenario(type: 'issue' | 'pr' | 'custom'): Promise<unknown> {
    switch (type) {
      case 'issue':
        return {
          workspace: this.SAMPLE_WORKTREE,
          issue: this.SAMPLE_ISSUE,
        }
      case 'pr':
        return {
          workspace: { ...this.SAMPLE_WORKTREE, isPR: true, prNumber: 30 },
          pr: this.SAMPLE_PR,
        }
      default:
        return {}
    }
  }
}

/**
 * Centralized mock factory management
 */
export class MockFactories {
  static git = new MockGitProvider()
  static github = new MockGitHubProvider()
  static neon = new MockNeonProvider()
  static claude = new MockClaudeProvider()
  static filesystem = new MockFileSystem()

  static resetAll(): void {
    this.git.reset()
    this.github.reset()
    this.neon.reset()
    this.claude.reset()
    this.filesystem.reset()
  }
}
