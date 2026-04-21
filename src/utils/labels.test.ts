import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./logger.js', () => ({
	logger: {
		warn: vi.fn(),
	},
}))

import { mergeLabels, parseLabelsFromEnv } from './labels.js'
import { logger } from './logger.js'

describe('mergeLabels', () => {
	it('returns empty array when both inputs are omitted', () => {
		expect(mergeLabels()).toEqual([])
	})

	it('returns empty array when both inputs are empty', () => {
		expect(mergeLabels([], [])).toEqual([])
	})

	it('returns configured labels when supplied is empty', () => {
		expect(mergeLabels(['bug', 'priority:high'], [])).toEqual(['bug', 'priority:high'])
	})

	it('returns supplied labels when configured is empty', () => {
		expect(mergeLabels([], ['feature', 'needs-review'])).toEqual(['feature', 'needs-review'])
	})

	it('preserves configured-first order when merging both inputs', () => {
		expect(mergeLabels(['ai-generated', 'needs-triage'], ['bug'])).toEqual([
			'ai-generated',
			'needs-triage',
			'bug',
		])
	})

	it('dedupes labels present in both inputs (configured wins)', () => {
		expect(mergeLabels(['ai-generated', 'bug'], ['bug', 'feature'])).toEqual([
			'ai-generated',
			'bug',
			'feature',
		])
	})

	it('dedupes duplicates within the configured list', () => {
		expect(mergeLabels(['bug', 'bug', 'feature'], [])).toEqual(['bug', 'feature'])
	})

	it('dedupes duplicates within the supplied list', () => {
		expect(mergeLabels([], ['bug', 'bug', 'feature'])).toEqual(['bug', 'feature'])
	})

	it('is case-sensitive (Bug and bug are distinct)', () => {
		expect(mergeLabels(['Bug'], ['bug'])).toEqual(['Bug', 'bug'])
	})

	it('handles undefined inputs as empty arrays', () => {
		expect(mergeLabels(undefined, ['bug'])).toEqual(['bug'])
		expect(mergeLabels(['bug'], undefined)).toEqual(['bug'])
		expect(mergeLabels(undefined, undefined)).toEqual([])
	})
})

describe('parseLabelsFromEnv', () => {
	beforeEach(() => {
		vi.mocked(logger.warn).mockReset()
	})

	it('returns [] when env value is missing', () => {
		expect(parseLabelsFromEnv(undefined, 'TEST_LABELS')).toEqual([])
		expect(logger.warn).not.toHaveBeenCalled()
	})

	it('parses a valid JSON array of non-empty strings', () => {
		expect(parseLabelsFromEnv('["bug","needs-triage"]', 'TEST_LABELS')).toEqual(['bug', 'needs-triage'])
		expect(logger.warn).not.toHaveBeenCalled()
	})

	it('returns [] and warns when parsed value is not an array', () => {
		expect(parseLabelsFromEnv('"bug"', 'TEST_LABELS')).toEqual([])
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining('TEST_LABELS must be a JSON array of strings')
		)
	})

	it('returns [] and warns when array contains non-string or empty entries', () => {
		expect(parseLabelsFromEnv('["bug", ""]', 'TEST_LABELS')).toEqual([])
		expect(logger.warn).toHaveBeenCalledWith(
			'TEST_LABELS contains a non-string or empty entry. Ignoring entire value.'
		)
	})

	it('returns [] and warns when JSON is invalid', () => {
		expect(parseLabelsFromEnv('{', 'TEST_LABELS')).toEqual([])
		expect(logger.warn).toHaveBeenCalledWith(
			'Invalid JSON in TEST_LABELS. Ignoring.',
			expect.objectContaining({ error: expect.any(String) })
		)
	})
})
