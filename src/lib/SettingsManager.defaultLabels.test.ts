import { describe, it, expect } from 'vitest'
import { IloomSettingsSchema, IloomSettingsSchemaNoDefaults } from './SettingsManager.js'

/**
 * Focused tests for the `defaultLabels` Zod schema additions on
 * issueManagement.github and issueManagement.jira.
 *
 * Covers both the main schema (which applies defaults) and the non-defaulting
 * variant used during pre-merge validation — the dual-schema pattern is easy
 * to get wrong, so we explicitly assert behavior on both.
 */

describe('IloomSettingsSchema - github.defaultLabels', () => {
	it('accepts a valid array of label strings', () => {
		const parsed = IloomSettingsSchema.parse({
			issueManagement: {
				github: {
					remote: 'origin',
					defaultLabels: ['ai-generated', 'needs-triage'],
				},
			},
		})
		expect(parsed.issueManagement?.github?.defaultLabels).toEqual([
			'ai-generated',
			'needs-triage',
		])
	})

	it('defaults to [] when omitted', () => {
		const parsed = IloomSettingsSchema.parse({
			issueManagement: {
				github: {
					remote: 'origin',
				},
			},
		})
		expect(parsed.issueManagement?.github?.defaultLabels).toEqual([])
	})

	it('rejects empty-string labels', () => {
		expect(() =>
			IloomSettingsSchema.parse({
				issueManagement: {
					github: {
						remote: 'origin',
						defaultLabels: ['bug', ''],
					},
				},
			})
		).toThrow()
	})
})

describe('IloomSettingsSchema - jira.defaultLabels', () => {
	const jiraBase = {
		host: 'https://example.atlassian.net',
		username: 'user@example.com',
		apiToken: 'token',
		projectKey: 'PROJ',
	}

	it('accepts a valid array of label strings', () => {
		const parsed = IloomSettingsSchema.parse({
			issueManagement: {
				jira: {
					...jiraBase,
					defaultLabels: ['ai-generated', 'needs-triage'],
				},
			},
		})
		expect(parsed.issueManagement?.jira?.defaultLabels).toEqual([
			'ai-generated',
			'needs-triage',
		])
	})

	it('defaults to [] when omitted', () => {
		const parsed = IloomSettingsSchema.parse({
			issueManagement: {
				jira: jiraBase,
			},
		})
		expect(parsed.issueManagement?.jira?.defaultLabels).toEqual([])
	})

	it('rejects empty-string labels', () => {
		expect(() =>
			IloomSettingsSchema.parse({
				issueManagement: {
					jira: {
						...jiraBase,
						defaultLabels: ['', 'bug'],
					},
				},
			})
		).toThrow()
	})
})

describe('IloomSettingsSchemaNoDefaults - defaultLabels', () => {
	// The non-defaulting schema is used on individual settings files before
	// they are merged. Crucially, it must NOT inject `defaultLabels: []` — that
	// would pollute the merged result and clobber labels set in a
	// lower-priority settings file.

	it('leaves github.defaultLabels undefined when omitted', () => {
		const parsed = IloomSettingsSchemaNoDefaults.parse({
			issueManagement: {
				github: { remote: 'origin' },
			},
		})
		expect(parsed.issueManagement?.github?.defaultLabels).toBeUndefined()
	})

	it('leaves jira.defaultLabels undefined when omitted', () => {
		const parsed = IloomSettingsSchemaNoDefaults.parse({
			issueManagement: {
				jira: {
					host: 'https://example.atlassian.net',
					username: 'u',
					projectKey: 'PROJ',
				},
			},
		})
		expect(parsed.issueManagement?.jira?.defaultLabels).toBeUndefined()
	})

	it('still validates non-empty label entries when provided', () => {
		expect(() =>
			IloomSettingsSchemaNoDefaults.parse({
				issueManagement: {
					github: {
						remote: 'origin',
						defaultLabels: ['ok', ''],
					},
				},
			})
		).toThrow()
	})

	it('accepts arrays when provided', () => {
		const parsed = IloomSettingsSchemaNoDefaults.parse({
			issueManagement: {
				github: {
					remote: 'origin',
					defaultLabels: ['bug'],
				},
			},
		})
		expect(parsed.issueManagement?.github?.defaultLabels).toEqual(['bug'])
	})
})
