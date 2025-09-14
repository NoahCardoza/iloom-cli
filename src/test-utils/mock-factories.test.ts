import { describe, it, expect, beforeEach } from 'vitest'
import { MockFactories, TestFixtures } from './mock-factories.js'

describe('MockFactories', () => {
  beforeEach(() => {
    MockFactories.resetAll()
  })

  describe('MockGitProvider', () => {
    it('should setup and reset scenarios correctly', () => {
      const { git } = MockFactories

      git.setupWorktreeScenario('existing', { path: '/test' })
      expect(git['scenarios'].get('worktree')).toEqual({
        scenario: 'existing',
        data: { path: '/test' },
      })

      git.reset()
      expect(git['scenarios'].size).toBe(0)
    })

    it('should create mock command functions', () => {
      const { git } = MockFactories
      const mockFn = git.mockCommand('git worktree list', 'worktree output')

      expect(typeof mockFn).toBe('function')
      expect(mockFn).toBeDefined()
    })
  })

  describe('MockGitHubProvider', () => {
    it('should setup issue and PR responses', () => {
      const { github } = MockFactories

      github.setupIssueResponse(25, TestFixtures.SAMPLE_ISSUE)
      github.setupPRResponse(30, TestFixtures.SAMPLE_PR)

      expect(github['responses'].get('issue-25')).toEqual(TestFixtures.SAMPLE_ISSUE)
      expect(github['responses'].get('pr-30')).toEqual(TestFixtures.SAMPLE_PR)
    })
  })

  describe('MockFileSystem', () => {
    it('should setup files and directories', () => {
      const { filesystem } = MockFactories

      filesystem.setupFile('/test/.env', 'NODE_ENV=test')
      filesystem.setupDirectory('/test/workspace')

      expect(filesystem['files'].get('/test/.env')).toBe('NODE_ENV=test')
      expect(filesystem['directories'].has('/test/workspace')).toBe(true)
    })

    it('should create file operation mocks', () => {
      const { filesystem } = MockFactories
      const readMock = filesystem.mockReadFile('/test/.env', 'content')
      const writeMock = filesystem.mockWriteFile('/test/.env')

      expect(typeof readMock).toBe('function')
      expect(typeof writeMock).toBe('function')
    })
  })

  describe('TestFixtures', () => {
    it('should provide sample data', () => {
      expect(TestFixtures.SAMPLE_ISSUE).toMatchObject({
        number: 25,
        title: expect.any(String),
        state: 'open',
      })

      expect(TestFixtures.SAMPLE_PR).toMatchObject({
        number: 30,
        title: expect.any(String),
        state: 'open',
      })

      expect(TestFixtures.SAMPLE_WORKTREE).toMatchObject({
        path: expect.any(String),
        branch: expect.any(String),
        issueNumber: 25,
      })
    })

    it('should create workspace scenarios', async () => {
      const issueScenario = await TestFixtures.createWorkspaceScenario('issue')
      const prScenario = await TestFixtures.createWorkspaceScenario('pr')

      expect(issueScenario).toHaveProperty('workspace')
      expect(issueScenario).toHaveProperty('issue')

      expect(prScenario).toHaveProperty('workspace')
      expect(prScenario).toHaveProperty('pr')
    })
  })

  describe('resetAll', () => {
    it('should reset all mock factories', () => {
      const { git, github, neon, claude, filesystem } = MockFactories

      // Setup some data
      git.setupWorktreeScenario('existing')
      github.setupIssueResponse(1, {})
      neon.setupBranchResponse('test', {})
      claude.setupContextResponse('test', {})
      filesystem.setupFile('/test', 'content')

      // Reset all
      MockFactories.resetAll()

      // Verify all are reset
      expect(git['scenarios'].size).toBe(0)
      expect(github['responses'].size).toBe(0)
      expect(neon['branches'].size).toBe(0)
      expect(claude['contexts'].size).toBe(0)
      expect(filesystem['files'].size).toBe(0)
    })
  })
})
