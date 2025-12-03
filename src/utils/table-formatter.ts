/**
 * Table formatting utilities for creating markdown tables with controlled column widths
 * Uses &nbsp; entities to force minimum column widths in markdown renderers like Linear
 */

export interface TableFormatterOptions {
	/** Target total width across all headers (default: 140) */
	targetTotalWidth?: number
	/** Padding character to use (default: '&nbsp;') */
	paddingChar?: string
	/** Maximum number of padding entities per column (default: 16) */
	maxPadding?: number
}

export interface TableGenerationOptions extends TableFormatterOptions {
	/** Table headers */
	headers: string[]
	/** Table rows data */
	rows: string[][]
}

export class TableFormatter {
	private static readonly DEFAULT_TARGET_WIDTH = 140
	private static readonly DEFAULT_PADDING_CHAR = '&nbsp;'
	private static readonly DEFAULT_MAX_PADDING = 16

	/**
	 * Pad table headers to achieve equal column widths
	 * @param headers Array of header text
	 * @param options Formatting options
	 * @returns Array of padded headers
	 */
	static padHeaders(
		headers: string[],
		options: TableFormatterOptions = {}
	): string[] {
		if (!headers || headers.length === 0) {
			throw new Error('Headers array cannot be empty')
		}

		const {
			targetTotalWidth = this.DEFAULT_TARGET_WIDTH,
			paddingChar = this.DEFAULT_PADDING_CHAR,
			maxPadding = this.DEFAULT_MAX_PADDING,
		} = options

		const columnCount = headers.length
		const targetWidthPerColumn = Math.floor(targetTotalWidth / columnCount)

		return headers.map((header) => {
			const currentLength = header.length
			const paddingNeeded = Math.max(0, targetWidthPerColumn - currentLength)
			const cappedPadding = Math.min(paddingNeeded, maxPadding)
			const padding = paddingChar.repeat(cappedPadding)

			return header + padding
		})
	}

	/**
	 * Generate a complete markdown table with padded headers
	 * @param options Table generation options
	 * @returns Complete markdown table string
	 */
	static generateTable(options: TableGenerationOptions): string {
		const { headers, rows, ...paddingOptions } = options

		if (!rows || rows.length === 0) {
			throw new Error('Table must have at least one row')
		}

		// Validate row lengths match header count
		const invalidRows = rows.filter(row => row.length !== headers.length)
		if (invalidRows.length > 0) {
			throw new Error(
				`All rows must have ${headers.length} columns. Found rows with ${invalidRows[0]?.length} columns.`
			)
		}

		const paddedHeaders = this.padHeaders(headers, paddingOptions)

		// Create header row
		const headerRow = `| ${paddedHeaders.join(' | ')} |`

		// Create separator row
		const separators = headers.map(() => '---')
		const separatorRow = `| ${separators.join(' | ')} |`

		// Create data rows
		const dataRows = rows.map(row => `| ${row.join(' | ')} |`).join('\n')

		return [headerRow, separatorRow, dataRows].join('\n')
	}

	/**
	 * Calculate the optimal width distribution for given headers
	 * @param headers Array of header text
	 * @param targetTotalWidth Target total width
	 * @param maxPadding Maximum padding entities per column
	 * @returns Width distribution information
	 */
	static calculateWidthDistribution(
		headers: string[],
		targetTotalWidth: number = this.DEFAULT_TARGET_WIDTH,
		maxPadding: number = this.DEFAULT_MAX_PADDING
	): {
		totalWidth: number
		widthPerColumn: number
		headers: Array<{
			text: string
			currentLength: number
			targetLength: number
			paddingNeeded: number
			paddingUsed: number
		}>
	} {
		if (!headers || headers.length === 0) {
			throw new Error('Headers array cannot be empty')
		}

		const columnCount = headers.length
		const widthPerColumn = Math.floor(targetTotalWidth / columnCount)

		const headerInfo = headers.map((header) => {
			const paddingNeeded = Math.max(0, widthPerColumn - header.length)
			const paddingUsed = Math.min(paddingNeeded, maxPadding)

			return {
				text: header,
				currentLength: header.length,
				targetLength: widthPerColumn,
				paddingNeeded,
				paddingUsed,
			}
		})

		return {
			totalWidth: targetTotalWidth,
			widthPerColumn,
			headers: headerInfo,
		}
	}

	/**
	 * Create a simple two-column assessment table (common pattern)
	 * @param assessmentData Array of [question, answer] pairs
	 * @param options Formatting options
	 * @returns Formatted markdown table
	 */
	static createAssessmentTable(
		assessmentData: Array<[string, string]>,
		options: TableFormatterOptions = {}
	): string {
		const headers = ['Question', 'Answer']
		const rows = assessmentData

		return this.generateTable({
			headers,
			rows,
			...options,
		})
	}

	/**
	 * Create a three-column status table (common pattern)
	 * @param statusData Array of [task, status, assignee] tuples
	 * @param options Formatting options
	 * @returns Formatted markdown table
	 */
	static createStatusTable(
		statusData: Array<[string, string, string]>,
		options: TableFormatterOptions = {}
	): string {
		const headers = ['Task', 'Status', 'Assignee']
		const rows = statusData

		return this.generateTable({
			headers,
			rows,
			...options,
		})
	}

	/**
	 * Preview table formatting without generating full markdown
	 * Useful for debugging and development
	 * @param headers Array of header text
	 * @param options Formatting options
	 * @returns Human-readable formatting preview
	 */
	static previewFormatting(
		headers: string[],
		options: TableFormatterOptions = {}
	): string {
		const { maxPadding = this.DEFAULT_MAX_PADDING } = options

		const distribution = this.calculateWidthDistribution(
			headers,
			options.targetTotalWidth,
			maxPadding
		)

		const lines = [
			`Table Formatting Preview`,
			`========================`,
			`Target total width: ${distribution.totalWidth} characters`,
			`Columns: ${headers.length}`,
			`Width per column: ${distribution.widthPerColumn} characters`,
			`Max padding per column: ${maxPadding} entities`,
			``,
		]

		distribution.headers.forEach((header, index) => {
			const cappedIndicator = header.paddingUsed < header.paddingNeeded ? ' (capped)' : ''
			lines.push(
				`Column ${index + 1}: "${header.text}" (${header.currentLength} chars) + ${header.paddingUsed} padding${cappedIndicator} (target: ${header.paddingNeeded}) = ${header.currentLength + header.paddingUsed * 6} total string length`
			)
		})

		return lines.join('\n')
	}
}