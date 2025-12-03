import { describe, it, expect } from 'vitest'
import { TableFormatter } from './table-formatter.js'

describe('TableFormatter', () => {
	describe('padHeaders', () => {
		it('should pad headers to equal width with default maxPadding cap', () => {
			const headers = ['Question', 'Answer']
			const result = TableFormatter.padHeaders(headers, { targetTotalWidth: 140 })

			expect(result).toHaveLength(2)
			expect(result[0]).toMatch(/^Question&nbsp;/)
			expect(result[1]).toMatch(/^Answer&nbsp;/)

			// Each should be ~70 chars worth of content (140/2)
			// With default maxPadding of 16:
			// "Question" (8) + 16 * "&nbsp;" (6 chars each) = 8 + 96 = 104 total string length
			expect(result[0]).toHaveLength(8 + 16 * 6) // "Question" + 16 &nbsp; entities (capped from 62)
			expect(result[1]).toHaveLength(6 + 16 * 6) // "Answer" + 16 &nbsp; entities (capped from 64)
		})

		it('should handle three columns with maxPadding cap', () => {
			const headers = ['Task', 'Status', 'Assignee']
			const result = TableFormatter.padHeaders(headers, { targetTotalWidth: 150 })

			expect(result).toHaveLength(3)
			// Each should be 50 chars worth of content (150/3)
			// With default maxPadding of 16, padding is capped:
			expect(result[0]).toHaveLength(4 + 16 * 6) // "Task" + 16 &nbsp; entities (capped from 46)
			expect(result[1]).toHaveLength(6 + 16 * 6) // "Status" + 16 &nbsp; entities (capped from 44)
			expect(result[2]).toHaveLength(8 + 16 * 6) // "Assignee" + 16 &nbsp; entities (capped from 42)
		})

		it('should use custom padding character', () => {
			const headers = ['A', 'B']
			const result = TableFormatter.padHeaders(headers, {
				targetTotalWidth: 10,
				paddingChar: 'X',
				maxPadding: 5 // Allow more padding than default for this test
			})

			expect(result[0]).toBe('AXXXX') // 5 chars total (A + 4 X's)
			expect(result[1]).toBe('BXXXX') // 5 chars total (B + 4 X's)
		})

		it('should respect custom maxPadding limit', () => {
			const headers = ['Question', 'Answer']
			const result = TableFormatter.padHeaders(headers, {
				targetTotalWidth: 140,
				maxPadding: 8 // Custom limit lower than default
			})

			// With maxPadding of 8:
			// "Question" (8) + 8 * "&nbsp;" (6 chars each) = 8 + 48 = 56 total
			expect(result[0]).toHaveLength(8 + 8 * 6)
			expect(result[1]).toHaveLength(6 + 8 * 6)
		})

		it('should handle headers longer than target width', () => {
			const headers = ['Very Long Header Name', 'Short']
			const result = TableFormatter.padHeaders(headers, { targetTotalWidth: 20 })

			// Target per column is 10, but first header is 21 chars
			expect(result[0]).toBe('Very Long Header Name') // No padding added
			expect(result[1]).toHaveLength(5 + 5 * 6) // "Short" + 5 &nbsp; entities (doesn't exceed maxPadding of 16)
		})

		it('should throw error for empty headers array', () => {
			expect(() => {
				TableFormatter.padHeaders([])
			}).toThrow('Headers array cannot be empty')
		})

		it('should use default values when no options provided', () => {
			const headers = ['A', 'B']
			const result = TableFormatter.padHeaders(headers)

			// Default is 140 total width, so 70 per column
			// But with default maxPadding of 16, padding is capped
			expect(result[0]).toHaveLength(1 + 16 * 6) // "A" + 16 &nbsp; entities (capped from 69)
			expect(result[1]).toHaveLength(1 + 16 * 6) // "B" + 16 &nbsp; entities (capped from 69)
			expect(result[0]).toMatch(/^A&nbsp;/)
		})
	})

	describe('generateTable', () => {
		it('should generate complete markdown table', () => {
			const result = TableFormatter.generateTable({
				headers: ['Name', 'Age'],
				rows: [
					['Alice', '25'],
					['Bob', '30']
				],
				targetTotalWidth: 20
			})

			const lines = result.split('\n')
			expect(lines).toHaveLength(4) // header + separator + 2 data rows

			// Check header row format
			expect(lines[0]).toMatch(/^\| Name.*&nbsp.* \| Age.*&nbsp.* \|$/)

			// Check separator row
			expect(lines[1]).toBe('| --- | --- |')

			// Check data rows
			expect(lines[2]).toBe('| Alice | 25 |')
			expect(lines[3]).toBe('| Bob | 30 |')
		})

		it('should validate row column count matches headers', () => {
			expect(() => {
				TableFormatter.generateTable({
					headers: ['A', 'B'],
					rows: [
						['1', '2', '3'] // Too many columns
					]
				})
			}).toThrow('All rows must have 2 columns')
		})

		it('should throw error for empty rows', () => {
			expect(() => {
				TableFormatter.generateTable({
					headers: ['A', 'B'],
					rows: []
				})
			}).toThrow('Table must have at least one row')
		})
	})

	describe('calculateWidthDistribution', () => {
		it('should calculate width distribution with maxPadding capping', () => {
			const result = TableFormatter.calculateWidthDistribution(
				['Question', 'Answer'],
				140,
				16 // default maxPadding
			)

			expect(result.totalWidth).toBe(140)
			expect(result.widthPerColumn).toBe(70)
			expect(result.headers).toHaveLength(2)

			expect(result.headers[0]).toEqual({
				text: 'Question',
				currentLength: 8,
				targetLength: 70,
				paddingNeeded: 62,
				paddingUsed: 16 // capped from 62
			})

			expect(result.headers[1]).toEqual({
				text: 'Answer',
				currentLength: 6,
				targetLength: 70,
				paddingNeeded: 64,
				paddingUsed: 16 // capped from 64
			})
		})

		it('should handle headers that exceed target width', () => {
			const result = TableFormatter.calculateWidthDistribution(
				['Very Long Header Name', 'Short'],
				20,
				16
			)

			expect(result.headers[0].paddingNeeded).toBe(0) // No padding for long header
			expect(result.headers[0].paddingUsed).toBe(0)
			expect(result.headers[1].paddingNeeded).toBe(5) // "Short" needs 5 padding for 10 total
			expect(result.headers[1].paddingUsed).toBe(5) // Doesn't exceed maxPadding
		})
	})

	describe('createAssessmentTable', () => {
		it('should create assessment table with Question/Answer headers', () => {
			const assessmentData: Array<[string, string]> = [
				['What is the purpose?', 'Landing page'],
				['Who is the target?', 'Users']
			]

			const result = TableFormatter.createAssessmentTable(assessmentData, {
				targetTotalWidth: 60
			})

			expect(result).toContain('Question')
			expect(result).toContain('Answer')
			expect(result).toContain('What is the purpose?')
			expect(result).toContain('Landing page')
		})
	})

	describe('createStatusTable', () => {
		it('should create status table with Task/Status/Assignee headers', () => {
			const statusData: Array<[string, string, string]> = [
				['Setup DB', 'Complete', 'Alice'],
				['Create API', 'In Progress', 'Bob']
			]

			const result = TableFormatter.createStatusTable(statusData)

			expect(result).toContain('Task')
			expect(result).toContain('Status')
			expect(result).toContain('Assignee')
			expect(result).toContain('Setup DB')
			expect(result).toContain('Alice')
		})
	})

	describe('previewFormatting', () => {
		it('should generate human-readable preview with capped padding', () => {
			const result = TableFormatter.previewFormatting(
				['Question', 'Answer'],
				{ targetTotalWidth: 100, maxPadding: 16 }
			)

			expect(result).toContain('Table Formatting Preview')
			expect(result).toContain('Target total width: 100 characters')
			expect(result).toContain('Columns: 2')
			expect(result).toContain('Width per column: 50 characters')
			expect(result).toContain('Max padding per column: 16 entities')
			expect(result).toContain('Column 1: "Question" (8 chars) + 16 padding (capped) (target: 42)')
			expect(result).toContain('Column 2: "Answer" (6 chars) + 16 padding (capped) (target: 44)')
		})
	})

	describe('edge cases', () => {
		it('should handle single column table with maxPadding cap', () => {
			const result = TableFormatter.padHeaders(['Only Column'], { targetTotalWidth: 50 })

			expect(result).toHaveLength(1)
			// "Only Column" (11 chars) + max padding of 16
			expect(result[0]).toHaveLength(11 + 16 * 6) // "Only Column" + 16 &nbsp; entities (capped from 39)
		})

		it('should handle very small target widths', () => {
			const result = TableFormatter.padHeaders(['A', 'B'], { targetTotalWidth: 4 })

			// Each column gets 2 chars target, but headers are 1 char each
			// Padding needed is 1, which is less than maxPadding of 16
			expect(result[0]).toHaveLength(1 + 1 * 6) // "A" + 1 &nbsp; entity
			expect(result[1]).toHaveLength(1 + 1 * 6) // "B" + 1 &nbsp; entity
		})

		it('should handle empty string headers', () => {
			const result = TableFormatter.padHeaders(['', 'Header'], { targetTotalWidth: 20 })

			// Empty string + padding of 10 (capped at 16)
			expect(result[0]).toHaveLength(0 + 10 * 6) // 10 &nbsp; entities (doesn't exceed maxPadding)
			expect(result[1]).toHaveLength(6 + 4 * 6) // "Header" + 4 &nbsp; entities
		})
	})

	describe('integration tests', () => {
		it('should work end-to-end for realistic assessment table', () => {
			const assessmentData: Array<[string, string]> = [
				[
					'What is the purpose of this landing page?',
					'General marketing/product landing page for the ingredient-db-looms project'
				],
				[
					'Who is the target audience?',
					'Potential users and stakeholders visiting the project'
				],
				[
					'What key content should be included?',
					'Hero section with project title, brief description of ingredient-db-looms functionality, value proposition, and simple call-to-action'
				]
			]

			const result = TableFormatter.createAssessmentTable(assessmentData)

			// Should have proper structure
			const lines = result.split('\n')
			expect(lines).toHaveLength(5) // header + separator + 3 data rows

			// Headers should be padded
			expect(lines[0]).toMatch(/Question.*&nbsp.*Answer.*&nbsp/)

			// Data should be preserved exactly
			expect(result).toContain('General marketing/product landing page')
			expect(result).toContain('Potential users and stakeholders')
		})
	})
})