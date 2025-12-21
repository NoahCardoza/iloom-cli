import { describe, it, expect } from 'vitest'
import {
	formatHeaderSection,
	formatGoalSection,
	formatComplexitySection,
	formatEntriesSection,
	formatArtifactsSection,
	formatRecapMarkdown,
} from './recap-formatter.js'
import type { RecapOutput, RecapComplexity, RecapEntry, RecapArtifact } from '../mcp/recap-types.js'

describe('recap-formatter', () => {
	describe('formatHeaderSection', () => {
		it('should return header with title and file path', () => {
			const result = formatHeaderSection('/path/to/recap.json')
			expect(result).toBe('# Loom Recap\n\n**File:** `/path/to/recap.json`')
		})
	})

	describe('formatGoalSection', () => {
		it('should return goal section with goal string', () => {
			const result = formatGoalSection('Implement feature X')
			expect(result).toBe('## Goal\nImplement feature X')
		})

		it('should return (not set) when goal is null', () => {
			const result = formatGoalSection(null)
			expect(result).toBe('## Goal\n(not set)')
		})
	})

	describe('formatComplexitySection', () => {
		it('should return complexity with level and reason', () => {
			const complexity: RecapComplexity = {
				level: 'simple',
				reason: 'Just a formatting change',
				timestamp: '2025-01-01T00:00:00Z',
			}
			const result = formatComplexitySection(complexity)
			expect(result).toBe('## Complexity\n**simple** - Just a formatting change')
		})

		it('should return complexity with level only when no reason', () => {
			const complexity: RecapComplexity = {
				level: 'trivial',
				timestamp: '2025-01-01T00:00:00Z',
			}
			const result = formatComplexitySection(complexity)
			expect(result).toBe('## Complexity\n**trivial**')
		})

		it('should return (not set) when complexity is null', () => {
			const result = formatComplexitySection(null)
			expect(result).toBe('## Complexity\n(not set)')
		})
	})

	describe('formatEntriesSection', () => {
		it('should return entries section with count and list', () => {
			const entries: RecapEntry[] = [
				{ id: 'uuid-1', timestamp: '2025-01-01T00:00:00Z', type: 'decision', content: 'Use TypeScript' },
				{ id: 'uuid-2', timestamp: '2025-01-01T00:01:00Z', type: 'insight', content: 'Found helper function' },
			]
			const result = formatEntriesSection(entries)
			expect(result).toBe(
				'## Entries (2)\n- **[decision]** Use TypeScript\n- **[insight]** Found helper function'
			)
		})

		it('should return header only when entries array is empty', () => {
			const result = formatEntriesSection([])
			expect(result).toBe('## Entries (0)')
		})
	})

	describe('formatArtifactsSection', () => {
		it('should return artifacts section with count and list', () => {
			const artifacts: RecapArtifact[] = [
				{
					id: 'artifact-1',
					type: 'comment',
					primaryUrl: 'https://github.com/org/repo/issues/123#issuecomment-456',
					urls: {},
					description: 'Progress update',
					timestamp: '2025-01-01T00:02:00Z',
				},
				{
					id: 'artifact-2',
					type: 'pr',
					primaryUrl: 'https://github.com/org/repo/pull/124',
					urls: {},
					description: 'Feature PR',
					timestamp: '2025-01-01T00:03:00Z',
				},
			]
			const result = formatArtifactsSection(artifacts)
			expect(result).toBe(
				'## Artifacts (2)\n- **[comment](https://github.com/org/repo/issues/123#issuecomment-456)** Progress update\n- **[pr](https://github.com/org/repo/pull/124)** Feature PR'
			)
		})

		it('should return header only when artifacts array is empty', () => {
			const result = formatArtifactsSection([])
			expect(result).toBe('## Artifacts (0)')
		})
	})

	describe('formatRecapMarkdown', () => {
		it('should compose all sections into full markdown string', () => {
			const recap: RecapOutput = {
				filePath: '/path/to/recap.json',
				goal: 'Test goal',
				complexity: {
					level: 'simple',
					reason: 'reason text',
					timestamp: '2025-01-01T00:00:00Z',
				},
				entries: [
					{ id: 'uuid-1', timestamp: '2025-01-01T00:00:00Z', type: 'decision', content: 'Test decision' },
				],
				artifacts: [
					{
						id: 'artifact-1',
						type: 'comment',
						primaryUrl: 'https://url.com',
						urls: {},
						description: 'Description',
						timestamp: '2025-01-01T00:00:00Z',
					},
				],
			}

			const result = formatRecapMarkdown(recap)

			// Verify all sections are present
			expect(result).toContain('# Loom Recap')
			expect(result).toContain('**File:** `/path/to/recap.json`')
			expect(result).toContain('## Goal\nTest goal')
			expect(result).toContain('## Complexity\n**simple** - reason text')
			expect(result).toContain('## Entries (1)\n- **[decision]** Test decision')
			expect(result).toContain('## Artifacts (1)\n- **[comment](https://url.com)** Description')

			// Verify sections are separated by blank lines
			expect(result).toMatch(/\n\n## Goal/)
			expect(result).toMatch(/\n\n## Complexity/)
			expect(result).toMatch(/\n\n## Entries/)
			expect(result).toMatch(/\n\n## Artifacts/)
		})

		it('should handle empty/null fields', () => {
			const recap: RecapOutput = {
				filePath: '/path/to/recap.json',
				goal: null,
				complexity: null,
				entries: [],
				artifacts: [],
			}

			const result = formatRecapMarkdown(recap)

			expect(result).toContain('## Goal\n(not set)')
			expect(result).toContain('## Complexity\n(not set)')
			expect(result).toContain('## Entries (0)')
			expect(result).toContain('## Artifacts (0)')
		})
	})
})
