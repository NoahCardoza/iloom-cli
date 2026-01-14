// AdfMarkdownConverter - Converts between Atlassian Document Format (ADF) and Markdown
// Uses extended-markdown-adf-parser for bidirectional conversion

import { ADFDocument, Parser } from 'extended-markdown-adf-parser'

const parser = new Parser()

/**
 * Convert ADF (Atlassian Document Format) to Markdown
 * Used when reading issue descriptions and comments from Jira
 *
 * @param adf - ADF object, string, null, or undefined
 * @returns Markdown string
 */
export function adfToMarkdown(adf: unknown): string {
	// Handle null/undefined
	if (!adf) return ''

	// Handle plain string (already text, not ADF)
	if (typeof adf === 'string') return adf

	// Convert ADF object to markdown
	return parser.adfToMarkdown(adf as ADFDocument)
}

/**
 * Convert Markdown to ADF (Atlassian Document Format)
 * Used when writing issue descriptions and comments to Jira
 *
 * @param markdown - Markdown string
 * @returns ADF object suitable for Jira API v3
 */
export function markdownToAdf(markdown: string): object {
	if (!markdown) {
		return { type: 'doc', version: 1, content: [] }
	}
	return parser.markdownToAdf(markdown)
}
