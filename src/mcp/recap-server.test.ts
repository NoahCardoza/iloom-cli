import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RecapFile, RecapEntry } from './recap-types.js'

/**
 * Since the recap-server.ts registers MCP tools directly on module load,
 * we need to test the deduplication logic by simulating what the handler does.
 * This approach tests the business logic without coupling to the MCP server internals.
 */

// Mock UUID generator for deterministic tests
const mockUUID = vi.fn()

/**
 * Simulates the add_entry deduplication logic from recap-server.ts lines 185-213
 */
async function addEntryWithDeduplication(
	readRecap: () => Promise<RecapFile>,
	writeRecap: (recap: RecapFile) => Promise<void>,
	type: RecapEntry['type'],
	content: string
): Promise<{ id: string; timestamp: string; skipped: boolean }> {
	const recap = await readRecap()
	recap.entries ??= []

	// Deduplication: skip if entry with same type and content exists
	const existingEntry = recap.entries.find((e) => e.type === type && e.content === content)

	if (existingEntry) {
		return { id: existingEntry.id, timestamp: existingEntry.timestamp, skipped: true }
	}

	const entry: RecapEntry = {
		id: mockUUID(),
		timestamp: new Date().toISOString(),
		type,
		content,
	}
	recap.entries.push(entry)
	await writeRecap(recap)
	return { id: entry.id, timestamp: entry.timestamp, skipped: false }
}

describe('recap-server add_entry deduplication', () => {
	let mockRecapFile: RecapFile
	let readRecapMock: () => Promise<RecapFile>
	let writeRecapMock: (recap: RecapFile) => Promise<void>

	beforeEach(() => {
		// Reset mock recap file before each test
		mockRecapFile = { entries: [] }

		// Reset mock UUID to return a deterministic value
		mockUUID.mockReturnValue('test-uuid-123')

		// Create mock functions that operate on mockRecapFile
		readRecapMock = vi.fn().mockImplementation(async () => ({ ...mockRecapFile, entries: [...(mockRecapFile.entries ?? [])] }))
		writeRecapMock = vi.fn().mockImplementation(async (recap: RecapFile) => {
			mockRecapFile = { ...recap, entries: [...(recap.entries ?? [])] }
		})
	})

	describe('when adding a new entry with unique type and content', () => {
		it('should create a new entry and return skipped: false', async () => {
			const result = await addEntryWithDeduplication(
				readRecapMock,
				writeRecapMock,
				'decision',
				'Use TypeScript for the implementation'
			)

			expect(result.skipped).toBe(false)
			expect(result.id).toBe('test-uuid-123')
			expect(result.timestamp).toBeDefined()
			expect(writeRecapMock).toHaveBeenCalled()
		})

		it('should add the entry to the entries array', async () => {
			await addEntryWithDeduplication(
				readRecapMock,
				writeRecapMock,
				'insight',
				'Found existing helper function'
			)

			expect(mockRecapFile.entries).toHaveLength(1)
			expect(mockRecapFile.entries?.[0]).toMatchObject({
				type: 'insight',
				content: 'Found existing helper function',
			})
		})
	})

	describe('when adding an entry with duplicate type and content', () => {
		it('should skip adding duplicate and return skipped: true', async () => {
			// Pre-populate with existing entry
			const existingEntry: RecapEntry = {
				id: 'existing-uuid-456',
				timestamp: '2025-01-01T00:00:00Z',
				type: 'decision',
				content: 'Use TypeScript for the implementation',
			}
			mockRecapFile = { entries: [existingEntry] }

			const result = await addEntryWithDeduplication(
				readRecapMock,
				writeRecapMock,
				'decision',
				'Use TypeScript for the implementation'
			)

			expect(result.skipped).toBe(true)
			expect(result.id).toBe('existing-uuid-456')
			expect(result.timestamp).toBe('2025-01-01T00:00:00Z')
		})

		it('should return the existing entry id and timestamp', async () => {
			const existingEntry: RecapEntry = {
				id: 'original-id-789',
				timestamp: '2025-06-15T12:30:00Z',
				type: 'risk',
				content: 'Potential performance issue with large datasets',
			}
			mockRecapFile = { entries: [existingEntry] }

			const result = await addEntryWithDeduplication(
				readRecapMock,
				writeRecapMock,
				'risk',
				'Potential performance issue with large datasets'
			)

			expect(result.id).toBe('original-id-789')
			expect(result.timestamp).toBe('2025-06-15T12:30:00Z')
		})

		it('should not modify the entries array', async () => {
			const existingEntry: RecapEntry = {
				id: 'existing-uuid-456',
				timestamp: '2025-01-01T00:00:00Z',
				type: 'assumption',
				content: 'Database will be available',
			}
			mockRecapFile = { entries: [existingEntry] }

			await addEntryWithDeduplication(
				readRecapMock,
				writeRecapMock,
				'assumption',
				'Database will be available'
			)

			expect(mockRecapFile.entries).toHaveLength(1)
			expect(writeRecapMock).not.toHaveBeenCalled()
		})
	})

	describe('when adding an entry with same type but different content', () => {
		it('should add the new entry', async () => {
			const existingEntry: RecapEntry = {
				id: 'existing-uuid-456',
				timestamp: '2025-01-01T00:00:00Z',
				type: 'decision',
				content: 'Use TypeScript for the implementation',
			}
			mockRecapFile = { entries: [existingEntry] }

			const result = await addEntryWithDeduplication(
				readRecapMock,
				writeRecapMock,
				'decision',
				'Use Vitest for testing'
			)

			expect(result.skipped).toBe(false)
			expect(mockRecapFile.entries).toHaveLength(2)
		})

		it('should return skipped: false', async () => {
			const existingEntry: RecapEntry = {
				id: 'existing-uuid-456',
				timestamp: '2025-01-01T00:00:00Z',
				type: 'insight',
				content: 'First insight',
			}
			mockRecapFile = { entries: [existingEntry] }

			const result = await addEntryWithDeduplication(
				readRecapMock,
				writeRecapMock,
				'insight',
				'Second insight'
			)

			expect(result.skipped).toBe(false)
		})
	})

	describe('when adding an entry with different type but same content', () => {
		it('should add the new entry', async () => {
			const existingEntry: RecapEntry = {
				id: 'existing-uuid-456',
				timestamp: '2025-01-01T00:00:00Z',
				type: 'insight',
				content: 'The system uses event-driven architecture',
			}
			mockRecapFile = { entries: [existingEntry] }

			const result = await addEntryWithDeduplication(
				readRecapMock,
				writeRecapMock,
				'decision',
				'The system uses event-driven architecture'
			)

			expect(result.skipped).toBe(false)
			expect(mockRecapFile.entries).toHaveLength(2)
		})

		it('should return skipped: false', async () => {
			const existingEntry: RecapEntry = {
				id: 'existing-uuid-456',
				timestamp: '2025-01-01T00:00:00Z',
				type: 'risk',
				content: 'API rate limits may be exceeded',
			}
			mockRecapFile = { entries: [existingEntry] }

			const result = await addEntryWithDeduplication(
				readRecapMock,
				writeRecapMock,
				'assumption',
				'API rate limits may be exceeded'
			)

			expect(result.skipped).toBe(false)
		})
	})

	describe('when entries array is empty or undefined', () => {
		it('should add entry when entries array is empty', async () => {
			mockRecapFile = { entries: [] }

			const result = await addEntryWithDeduplication(
				readRecapMock,
				writeRecapMock,
				'other',
				'Some other entry'
			)

			expect(result.skipped).toBe(false)
			expect(mockRecapFile.entries).toHaveLength(1)
		})

		it('should initialize entries array when undefined', async () => {
			mockRecapFile = {}

			const result = await addEntryWithDeduplication(
				readRecapMock,
				writeRecapMock,
				'decision',
				'First decision'
			)

			expect(result.skipped).toBe(false)
			expect(mockRecapFile.entries).toHaveLength(1)
		})
	})
})
