import { appendFileSync } from 'node:fs'
import { join, dirname, basename, extname } from 'node:path'

/**
 * Utility class for converting HTML details/summary format to Linear's collapsible format
 *
 * Converts:
 * <details>
 * <summary>Header</summary>
 * CONTENT
 * </details>
 *
 * Into Linear format:
 * +++ Header
 *
 * CONTENT
 *
 * +++
 */
export class LinearMarkupConverter {
	/**
	 * Convert HTML details/summary blocks to Linear's collapsible format
	 * Handles nested details blocks recursively
	 *
	 * @param text - Text containing HTML details/summary blocks
	 * @returns Text with details/summary converted to Linear format
	 */
	static convertDetailsToLinear(text: string): string {
		if (!text) {
			return text
		}

		// Process from innermost to outermost to handle nesting correctly
		// Keep converting until no more details blocks are found
		let previousText = ''
		let currentText = text

		while (previousText !== currentText) {
			previousText = currentText
			currentText = this.convertSinglePass(currentText)
		}

		return currentText
	}

	/**
	 * Perform a single pass of details block conversion
	 * Converts the innermost details blocks first
	 */
	private static convertSinglePass(text: string): string {
		// Match <details> blocks with optional attributes on the details tag
		// Supports multiline content between tags
		const detailsRegex = /<details[^>]*>\s*<summary[^>]*>(.*?)<\/summary>\s*(.*?)\s*<\/details>/gis

		return text.replace(detailsRegex, (_match, summary, content) => {
			// Clean up the summary - trim whitespace and decode HTML entities
			const cleanSummary = this.cleanText(summary)

			// Clean up the content - preserve internal structure but normalize outer whitespace
			// Note: Don't recursively convert here - the while loop handles that
			const cleanContent = this.cleanContent(content)

			// Build Linear collapsible format
			// Always include blank lines around content for readability
			if (cleanContent) {
				return `+++ ${cleanSummary}\n\n${cleanContent}\n\n+++`
			} else {
				// Empty content - use minimal format
				return `+++ ${cleanSummary}\n\n+++`
			}
		})
	}

	/**
	 * Clean text by trimming whitespace and decoding common HTML entities
	 */
	private static cleanText(text: string): string {
		return text
			.trim()
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&amp;/g, '&')
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
	}

	/**
	 * Clean content while preserving internal structure
	 * - Removes leading/trailing whitespace
	 * - Normalizes internal blank lines (max 2 consecutive newlines)
	 * - Preserves code blocks and other formatting
	 */
	private static cleanContent(content: string): string {
		if (!content) {
			return ''
		}

		// Trim outer whitespace
		let cleaned = content.trim()

		// Normalize excessive blank lines (3+ newlines -> 2 newlines)
		cleaned = cleaned.replace(/\n{3,}/g, '\n\n')

		return cleaned
	}

	/**
	 * Check if text contains HTML details/summary blocks
	 * Useful for conditional conversion
	 */
	static hasDetailsBlocks(text: string): boolean {
		if (!text) {
			return false
		}

		const detailsRegex = /<details[^>]*>.*?<summary[^>]*>.*?<\/summary>.*?<\/details>/is
		return detailsRegex.test(text)
	}

	/**
	 * Remove wrapper tags from code sample details blocks
	 * Identifies details blocks where summary contains "X lines" pattern
	 * and removes the details/summary tags while preserving the content
	 *
	 * @param text - Text containing potential code sample details blocks
	 * @returns Text with code sample wrappers removed
	 */
	static removeCodeSampleWrappers(text: string): string {
		if (!text) {
			return text
		}

		// Match details blocks where summary contains "X lines" (e.g., "45 lines", "120 lines")
		// Pattern: <details><summary>...N lines...</summary>CONTENT</details>
		// Use [^<]* to match summary content without allowing nested tags to interfere
		// Then use [\s\S]*? for the content to allow any characters including newlines
		const codeSampleRegex = /<details[^>]*>\s*<summary[^>]*>([^<]*\d+\s+lines[^<]*)<\/summary>\s*([\s\S]*?)<\/details>/gi

		return text.replace(codeSampleRegex, (_match, _summary, content) => {
			// Return just the content, without any wrapper tags
			// Preserve the content exactly as-is
			return content.trim()
		})
	}

	/**
	 * Convert text for Linear - applies all necessary conversions
	 * Currently only converts details/summary blocks, but can be extended
	 * for other HTML to Linear markdown conversions
	 */
	static convertToLinear(text: string): string {
		if (!text) {
			return text
		}

		// Log input if logging is enabled
		this.logConversion('INPUT', text)

		// Apply all conversions
		let converted = text

		// First, remove code sample wrappers (details blocks with "X lines" pattern)
		// This prevents them from being converted to Linear's +++ format
		converted = this.removeCodeSampleWrappers(converted)

		// Then convert remaining details/summary blocks to Linear format
		converted = this.convertDetailsToLinear(converted)

		// Log output if logging is enabled
		this.logConversion('OUTPUT', converted)

		return converted
	}

	/**
	 * Log conversion input/output if LINEAR_MARKDOWN_LOG_FILE is set
	 */
	private static logConversion(label: string, content: string): void {
		const logFilePath = process.env.LINEAR_MARKDOWN_LOG_FILE
		if (!logFilePath) {
			return
		}

		try {
			const timestampedPath = this.getTimestampedLogPath(logFilePath)
			const timestamp = new Date().toISOString()
			const separator = '================================'

			const logEntry = `${separator}\n[${timestamp}] CONVERSION ${label}\n${separator}\n${label}:\n${content}\n\n`

			appendFileSync(timestampedPath, logEntry, 'utf-8')
		} catch {
			// Silently fail - don't crash if logging fails
			// This is a debug feature and shouldn't break the conversion
		}
	}

	/**
	 * Generate timestamped log file path
	 * Example: debug.log -> debug-20231202-161234.log
	 */
	private static getTimestampedLogPath(logFilePath: string): string {
		const dir = dirname(logFilePath)
		const ext = extname(logFilePath)
		const base = basename(logFilePath, ext)

		// Generate timestamp: YYYYMMDD-HHMMSS
		const now = new Date()
		const timestamp = [
			now.getFullYear(),
			String(now.getMonth() + 1).padStart(2, '0'),
			String(now.getDate()).padStart(2, '0'),
		].join('') + '-' + [
			String(now.getHours()).padStart(2, '0'),
			String(now.getMinutes()).padStart(2, '0'),
			String(now.getSeconds()).padStart(2, '0'),
		].join('')

		return join(dir, `${base}-${timestamp}${ext}`)
	}
}
