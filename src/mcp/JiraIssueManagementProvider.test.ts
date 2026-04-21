import { describe, it, expect, vi, beforeEach } from 'vitest'
import { JiraIssueManagementProvider } from './JiraIssueManagementProvider.js'
import type { IloomSettings } from '../lib/SettingsManager.js'
import type { JiraIssueLink, JiraIssue } from '../lib/providers/jira/JiraApiClient.js'

// Mock JiraIssueTracker
vi.mock('../lib/providers/jira/JiraIssueTracker.js', () => {
	return {
		JiraIssueTracker: vi.fn(),
	}
})

// Mock SettingsManager
vi.mock('../lib/SettingsManager.js', () => {
	return {
		SettingsManager: vi.fn(),
	}
})

// Helper to create a mock JiraIssueLink
function makeBlocksLink(opts: {
	id: string
	inwardKey?: string
	inwardSummary?: string
	outwardKey?: string
	outwardSummary?: string
}): JiraIssueLink {
	return {
		id: opts.id,
		type: { id: '10000', name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
		...(opts.inwardKey && {
			inwardIssue: {
				id: `id-${opts.inwardKey}`,
				key: opts.inwardKey,
				fields: {
					summary: opts.inwardSummary ?? `Summary for ${opts.inwardKey}`,
					status: { name: 'Open' },
				},
			},
		}),
		...(opts.outwardKey && {
			outwardIssue: {
				id: `id-${opts.outwardKey}`,
				key: opts.outwardKey,
				fields: {
					summary: opts.outwardSummary ?? `Summary for ${opts.outwardKey}`,
					status: { name: 'In Progress' },
				},
			},
		}),
	}
}

describe('JiraIssueManagementProvider - dependencies', () => {
	let provider: JiraIssueManagementProvider
	let mockCreateIssueLink: ReturnType<typeof vi.fn>
	let mockGetIssue: ReturnType<typeof vi.fn>
	let mockDeleteIssueLink: ReturnType<typeof vi.fn>
	let mockCloseIssue: ReturnType<typeof vi.fn>
	let mockReopenIssue: ReturnType<typeof vi.fn>
	let mockUpdateIssue: ReturnType<typeof vi.fn>

	beforeEach(() => {
		mockCreateIssueLink = vi.fn().mockResolvedValue(undefined)
		mockGetIssue = vi.fn()
		mockDeleteIssueLink = vi.fn().mockResolvedValue(undefined)
		mockCloseIssue = vi.fn().mockResolvedValue(undefined)
		mockReopenIssue = vi.fn().mockResolvedValue(undefined)
		mockUpdateIssue = vi.fn().mockResolvedValue(undefined)

		const mockApiClient = {
			createIssueLink: mockCreateIssueLink,
			getIssue: mockGetIssue,
			deleteIssueLink: mockDeleteIssueLink,
			updateIssue: mockUpdateIssue,
		}

		const mockTracker = {
			normalizeIdentifier: (id: string) => id.toUpperCase(),
			getApiClient: () => mockApiClient,
			getConfig: () => ({ host: 'https://jira.example.com' }),
			closeIssue: mockCloseIssue,
			reopenIssue: mockReopenIssue,
		}

		// Create provider and inject mock tracker via private field
		const settings = {
			issueManagement: {
				jira: {
					host: 'https://jira.example.com',
					username: 'user',
					apiToken: 'token',
					projectKey: 'PROJ',
				},
			},
		}

		provider = new JiraIssueManagementProvider(settings as IloomSettings)
		// Override the private tracker with our mock
		;(provider as unknown as { tracker: typeof mockTracker }).tracker = mockTracker
	})

	describe('createDependency', () => {
		it('passes blockingKey as inwardKey and blockedKey as outwardKey to createIssueLink', async () => {
			await provider.createDependency({ blockingIssue: 'PROJ-1', blockedIssue: 'PROJ-2' })

			expect(mockCreateIssueLink).toHaveBeenCalledWith('PROJ-1', 'PROJ-2', 'Blocks')
		})

		it('normalizes identifiers to uppercase', async () => {
			await provider.createDependency({ blockingIssue: 'proj-1', blockedIssue: 'proj-2' })

			expect(mockCreateIssueLink).toHaveBeenCalledWith('PROJ-1', 'PROJ-2', 'Blocks')
		})
	})

	describe('getDependencies', () => {
		it('maps outwardIssue to blocking and inwardIssue to blockedBy', async () => {
			mockGetIssue.mockResolvedValue({
				fields: {
					issuelinks: [
						// outwardIssue = this issue blocks PROJ-2
						makeBlocksLink({ id: 'link-1', outwardKey: 'PROJ-2' }),
						// inwardIssue = PROJ-3 blocks this issue (this issue is blocked by PROJ-3)
						makeBlocksLink({ id: 'link-2', inwardKey: 'PROJ-3' }),
					],
				},
			} as Partial<JiraIssue>)

			const result = await provider.getDependencies({ number: 'PROJ-1', direction: 'both' })

			expect(result.blocking).toHaveLength(1)
			expect(result.blocking[0].id).toBe('PROJ-2')
			expect(result.blockedBy).toHaveLength(1)
			expect(result.blockedBy[0].id).toBe('PROJ-3')
		})

		it('filters by direction=blocking (returns only blocking, empty blockedBy)', async () => {
			mockGetIssue.mockResolvedValue({
				fields: {
					issuelinks: [
						makeBlocksLink({ id: 'link-1', outwardKey: 'PROJ-2' }),
						makeBlocksLink({ id: 'link-2', inwardKey: 'PROJ-3' }),
					],
				},
			} as Partial<JiraIssue>)

			const result = await provider.getDependencies({ number: 'PROJ-1', direction: 'blocking' })

			expect(result.blocking).toHaveLength(1)
			expect(result.blocking[0].id).toBe('PROJ-2')
			expect(result.blockedBy).toHaveLength(0)
		})

		it('filters by direction=blocked_by (returns only blockedBy, empty blocking)', async () => {
			mockGetIssue.mockResolvedValue({
				fields: {
					issuelinks: [
						makeBlocksLink({ id: 'link-1', outwardKey: 'PROJ-2' }),
						makeBlocksLink({ id: 'link-2', inwardKey: 'PROJ-3' }),
					],
				},
			} as Partial<JiraIssue>)

			const result = await provider.getDependencies({ number: 'PROJ-1', direction: 'blocked_by' })

			expect(result.blocking).toHaveLength(0)
			expect(result.blockedBy).toHaveLength(1)
			expect(result.blockedBy[0].id).toBe('PROJ-3')
		})

		it('ignores non-Blocks link types', async () => {
			mockGetIssue.mockResolvedValue({
				fields: {
					issuelinks: [
						{
							id: 'link-1',
							type: { id: '10001', name: 'Relates', inward: 'relates to', outward: 'relates to' },
							outwardIssue: {
								id: 'id-PROJ-2',
								key: 'PROJ-2',
								fields: { summary: 'Related issue', status: { name: 'Open' } },
							},
						},
					],
				},
			} as Partial<JiraIssue>)

			const result = await provider.getDependencies({ number: 'PROJ-1', direction: 'both' })

			expect(result.blocking).toHaveLength(0)
			expect(result.blockedBy).toHaveLength(0)
		})
	})

	describe('removeDependency', () => {
		it('finds link by matching inwardIssue.key to blockingKey and deletes it', async () => {
			mockGetIssue.mockResolvedValue({
				fields: {
					issuelinks: [
						// On blocked issue PROJ-2, the blocker PROJ-1 appears as inwardIssue
						makeBlocksLink({ id: 'link-42', inwardKey: 'PROJ-1' }),
					],
				},
			} as Partial<JiraIssue>)

			await provider.removeDependency({ blockingIssue: 'PROJ-1', blockedIssue: 'PROJ-2' })

			expect(mockGetIssue).toHaveBeenCalledWith('PROJ-2')
			expect(mockDeleteIssueLink).toHaveBeenCalledWith('link-42')
		})

		it('throws when no matching dependency found', async () => {
			mockGetIssue.mockResolvedValue({
				fields: {
					issuelinks: [],
				},
			} as Partial<JiraIssue>)

			await expect(
				provider.removeDependency({ blockingIssue: 'PROJ-1', blockedIssue: 'PROJ-2' })
			).rejects.toThrow('No "Blocks" dependency found from PROJ-1 to PROJ-2')
		})
	})

	describe('closeIssue', () => {
		it('transitions issue to Done state via tracker', async () => {
			await provider.closeIssue({ number: 'PROJ-123' })

			expect(mockCloseIssue).toHaveBeenCalledWith('PROJ-123')
		})

		it('normalizes identifier to uppercase', async () => {
			await provider.closeIssue({ number: 'proj-123' })

			expect(mockCloseIssue).toHaveBeenCalledWith('PROJ-123')
		})
	})

	describe('reopenIssue', () => {
		it('transitions issue to Reopen state via tracker', async () => {
			await provider.reopenIssue({ number: 'PROJ-123' })

			expect(mockReopenIssue).toHaveBeenCalledWith('PROJ-123')
		})

		it('normalizes identifier to uppercase', async () => {
			await provider.reopenIssue({ number: 'proj-123' })

			expect(mockReopenIssue).toHaveBeenCalledWith('PROJ-123')
		})
	})

	describe('editIssue', () => {
		it('updates issue summary via Jira API', async () => {
			await provider.editIssue({ number: 'PROJ-123', title: 'New Title' })

			expect(mockUpdateIssue).toHaveBeenCalledWith('PROJ-123', { summary: 'New Title' })
		})

		it('updates issue description via Jira API', async () => {
			await provider.editIssue({ number: 'PROJ-123', body: 'New Body' })

			expect(mockUpdateIssue).toHaveBeenCalledWith('PROJ-123', { description: 'New Body' })
		})

		it('handles state change to closed via closeIssue', async () => {
			await provider.editIssue({ number: 'PROJ-123', state: 'closed' })

			expect(mockCloseIssue).toHaveBeenCalledWith('PROJ-123')
			expect(mockUpdateIssue).not.toHaveBeenCalled()
		})

		it('handles state change to open via reopenIssue', async () => {
			await provider.editIssue({ number: 'PROJ-123', state: 'open' })

			expect(mockReopenIssue).toHaveBeenCalledWith('PROJ-123')
			expect(mockUpdateIssue).not.toHaveBeenCalled()
		})

		it('handles state change with field updates', async () => {
			await provider.editIssue({ number: 'PROJ-123', state: 'closed', title: 'Updated Title' })

			expect(mockCloseIssue).toHaveBeenCalledWith('PROJ-123')
			expect(mockUpdateIssue).toHaveBeenCalledWith('PROJ-123', { summary: 'Updated Title' })
		})
	})
})

describe('JiraIssueManagementProvider - createIssue / createChildIssue label merging', () => {
	let provider: JiraIssueManagementProvider
	let mockCreateIssue: ReturnType<typeof vi.fn>
	let mockCreateIssueWithParent: ReturnType<typeof vi.fn>
	let configuredDefaultLabels: string[] | undefined

	function buildProvider(opts: { defaultLabels?: string[] } = {}) {
		configuredDefaultLabels = opts.defaultLabels
		mockCreateIssue = vi.fn().mockResolvedValue({ key: 'PROJ-42' })
		mockCreateIssueWithParent = vi.fn().mockResolvedValue({ key: 'PROJ-43' })

		const mockApiClient = {
			createIssue: mockCreateIssue,
			createIssueWithParent: mockCreateIssueWithParent,
		}

		const mockTracker = {
			normalizeIdentifier: (id: string) => id.toUpperCase(),
			getApiClient: () => mockApiClient,
			getConfig: () => ({
				host: 'https://jira.example.com',
				defaultSubtaskType: 'Subtask',
				...(configuredDefaultLabels !== undefined && {
					defaultLabels: configuredDefaultLabels,
				}),
			}),
			// createIssue on the tracker calls the api client.createIssue; emulate that
			createIssue: (title: string, body: string, _repo?: string, labels?: string[]) => {
				return mockCreateIssue('PROJ', title, body, undefined, labels).then(
					(issue: { key: string }) => ({
						number: issue.key,
						url: `https://jira.example.com/browse/${issue.key}`,
					})
				)
			},
		}

		const settings = {
			issueManagement: {
				jira: {
					host: 'https://jira.example.com',
					username: 'user',
					apiToken: 'token',
					projectKey: 'PROJ',
				},
			},
		}

		provider = new JiraIssueManagementProvider(settings as IloomSettings)
		;(provider as unknown as { tracker: typeof mockTracker }).tracker = mockTracker
		// projectKey is captured in the constructor from the real config; we need
		// to update it so createChildIssue uses the expected project key
		;(provider as unknown as { projectKey: string }).projectKey = 'PROJ'
	}

	describe('createIssue', () => {
		it('merges configured defaultLabels with agent-supplied labels (configured first)', async () => {
			buildProvider({ defaultLabels: ['ai-generated', 'needs-triage'] })

			await provider.createIssue({ title: 'T', body: 'B', labels: ['bug'] })

			// Extract the labels arg (5th positional argument)
			const labelsArg = mockCreateIssue.mock.calls[0][4]
			expect(labelsArg).toEqual(['ai-generated', 'needs-triage', 'bug'])
		})

		it('dedupes overlap between configured and supplied labels', async () => {
			buildProvider({ defaultLabels: ['bug', 'needs-triage'] })

			await provider.createIssue({ title: 'T', body: 'B', labels: ['bug', 'feature'] })

			const labelsArg = mockCreateIssue.mock.calls[0][4]
			expect(labelsArg).toEqual(['bug', 'needs-triage', 'feature'])
		})

		it('rejects labels containing whitespace with a clear error naming the label', async () => {
			buildProvider({ defaultLabels: ['needs triage'] })

			await expect(
				provider.createIssue({ title: 'T', body: 'B' })
			).rejects.toThrow(/"needs triage"/)
			expect(mockCreateIssue).not.toHaveBeenCalled()
		})

		it('rejects agent-supplied labels containing whitespace', async () => {
			buildProvider({ defaultLabels: [] })

			await expect(
				provider.createIssue({ title: 'T', body: 'B', labels: ['has space'] })
			).rejects.toThrow(/"has space"/)
			expect(mockCreateIssue).not.toHaveBeenCalled()
		})

		it('rejects labels containing commas with a clear error naming the label', async () => {
			buildProvider({ defaultLabels: ['needs,triage'] })

			await expect(
				provider.createIssue({ title: 'T', body: 'B' })
			).rejects.toThrow(/whitespace or commas: "needs,triage"/)
			expect(mockCreateIssue).not.toHaveBeenCalled()
		})

		it('passes undefined labels to the API when no labels are configured or supplied (regression)', async () => {
			buildProvider({ defaultLabels: [] })

			await provider.createIssue({ title: 'T', body: 'B' })

			const labelsArg = mockCreateIssue.mock.calls[0][4]
			expect(labelsArg).toBeUndefined()
		})

		it('uses configured labels alone when agent supplies none', async () => {
			buildProvider({ defaultLabels: ['ai-generated'] })

			await provider.createIssue({ title: 'T', body: 'B' })

			const labelsArg = mockCreateIssue.mock.calls[0][4]
			expect(labelsArg).toEqual(['ai-generated'])
		})
	})

	describe('createChildIssue', () => {
		it('merges configured defaultLabels with agent-supplied labels (configured first)', async () => {
			buildProvider({ defaultLabels: ['ai-generated', 'needs-triage'] })

			await provider.createChildIssue({
				parentId: 'PROJ-1',
				title: 'T',
				body: 'B',
				labels: ['bug'],
			})

			// createIssueWithParent(projectKey, title, body, parentKey, issueType, labels)
			const labelsArg = mockCreateIssueWithParent.mock.calls[0][5]
			expect(labelsArg).toEqual(['ai-generated', 'needs-triage', 'bug'])
		})

		it('dedupes overlapping labels', async () => {
			buildProvider({ defaultLabels: ['bug'] })

			await provider.createChildIssue({
				parentId: 'PROJ-1',
				title: 'T',
				body: 'B',
				labels: ['bug', 'feature'],
			})

			const labelsArg = mockCreateIssueWithParent.mock.calls[0][5]
			expect(labelsArg).toEqual(['bug', 'feature'])
		})

		it('omits labels from the API call when neither configured nor supplied (regression)', async () => {
			buildProvider({ defaultLabels: [] })

			await provider.createChildIssue({ parentId: 'PROJ-1', title: 'T', body: 'B' })

			const labelsArg = mockCreateIssueWithParent.mock.calls[0][5]
			expect(labelsArg).toBeUndefined()
		})

		it('validates whitespace for child issues too', async () => {
			buildProvider({ defaultLabels: ['has space'] })

			await expect(
				provider.createChildIssue({ parentId: 'PROJ-1', title: 'T', body: 'B' })
			).rejects.toThrow(/"has space"/)
			expect(mockCreateIssueWithParent).not.toHaveBeenCalled()
		})

		it('validates commas for child issues too', async () => {
			buildProvider({ defaultLabels: ['has,comma'] })

			await expect(
				provider.createChildIssue({ parentId: 'PROJ-1', title: 'T', body: 'B' })
			).rejects.toThrow(/"has,comma"/)
			expect(mockCreateIssueWithParent).not.toHaveBeenCalled()
		})
	})
})
