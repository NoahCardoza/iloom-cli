// JiraCommentFormatter - Converts Markdown to Jira Wiki Markup
// Handles common formatting patterns for posting iloom content to Jira

/**
 * JiraCommentFormatter converts Markdown content to Jira Wiki Markup format
 * 
 * Jira Wiki Markup reference:
 * https://jira.atlassian.com/secure/WikiRendererHelpAction.jspa?section=all
 * 
 * Supported conversions:
 * - Headers (# → h1., ## → h2., etc.)
 * - Bold (**text** → *text*)
 * - Italic (*text* → _text_)
 * - Code blocks (``` → {code})
 * - Inline code (`text` → {{text}})
 * - Links ([text](url) → [text|url])
 * - Lists (* item → * item)
 */
export class JiraCommentFormatter {
	/**
	 * Convert Markdown content to Jira Wiki Markup
	 */
	static markdownToJira(markdown: string): string {
		let jira = markdown

		// Convert code blocks (must be done before inline code)
		// ```language\ncode\n``` → {code:language}\ncode\n{code}
		jira = jira.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
			if (lang) {
				return `{code:${lang}}\n${code.trim()}\n{code}`
			}
			return `{code}\n${code.trim()}\n{code}`
		})

		// Convert inline code
		// `code` → {{code}}
		jira = jira.replace(/`([^`]+)`/g, '{{$1}}')

		// Convert headers
		// # Header → h1. Header
		jira = jira.replace(/^######\s+(.+)$/gm, 'h6. $1')
		jira = jira.replace(/^#####\s+(.+)$/gm, 'h5. $1')
		jira = jira.replace(/^####\s+(.+)$/gm, 'h4. $1')
		jira = jira.replace(/^###\s+(.+)$/gm, 'h3. $1')
		jira = jira.replace(/^##\s+(.+)$/gm, 'h2. $1')
		jira = jira.replace(/^#\s+(.+)$/gm, 'h1. $1')

		// Convert bold (must be done before italic to handle ***)
		// **text** → *text*
		jira = jira.replace(/\*\*([^*]+)\*\*/g, '*$1*')

		// Convert italic
		// *text* → _text_
		// _text_ → _text_ (already correct)
		jira = jira.replace(/(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g, '_$1_')

		// Convert strikethrough
		// ~~text~~ → -text-
		jira = jira.replace(/~~([^~]+)~~/g, '-$1-')

		// Convert links
		// [text](url) → [text|url]
		jira = jira.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '[$1|$2]')

		// Convert unordered lists (Markdown → Jira both use *, so no change needed)
		// * item → * item (already correct)

		// Convert ordered lists
		// 1. item → # item
		jira = jira.replace(/^\d+\.\s+(.+)$/gm, '# $1')

		// Convert blockquotes
		// > quote → {quote}quote{quote}
		jira = jira.replace(/^>\s+(.+)$/gm, '{quote}$1{quote}')

		// Convert horizontal rules
		// --- → ----
		jira = jira.replace(/^---+$/gm, '----')

		return jira
	}

	/**
	 * Convert Jira Wiki Markup to Markdown (reverse operation)
	 * Useful for displaying Jira content in terminal or logs
	 */
	static jiraToMarkdown(jira: string): string {
		let markdown = jira

		// Convert code blocks
		// {code:language}\ncode\n{code} → ```language\ncode\n```
		markdown = markdown.replace(/\{code:(\w+)\}\n([\s\S]*?)\{code\}/g, '```$1\n$2```')
		markdown = markdown.replace(/\{code\}\n([\s\S]*?)\{code\}/g, '```\n$1```')

		// Convert inline code
		// {{code}} → `code`
		markdown = markdown.replace(/\{\{([^}]+)\}\}/g, '`$1`')

		// Convert headers
		// h1. Header → # Header
		markdown = markdown.replace(/^h6\.\s+(.+)$/gm, '###### $1')
		markdown = markdown.replace(/^h5\.\s+(.+)$/gm, '##### $1')
		markdown = markdown.replace(/^h4\.\s+(.+)$/gm, '#### $1')
		markdown = markdown.replace(/^h3\.\s+(.+)$/gm, '### $1')
		markdown = markdown.replace(/^h2\.\s+(.+)$/gm, '## $1')
		markdown = markdown.replace(/^h1\.\s+(.+)$/gm, '# $1')

		// Convert bold
		// *text* → **text**
		markdown = markdown.replace(/\*([^*]+)\*/g, '**$1**')

		// Convert italic
		// _text_ → *text*
		markdown = markdown.replace(/_([^_]+)_/g, '*$1*')

		// Convert strikethrough
		// -text- → ~~text~~
		markdown = markdown.replace(/-([^-]+)-/g, '~~$1~~')

		// Convert links
		// [text|url] → [text](url)
		markdown = markdown.replace(/\[([^\]|]+)\|([^\]]+)\]/g, '[$1]($2)')

		// Convert ordered lists
		// # item → 1. item
		let listCounter = 0
		markdown = markdown.replace(/^#\s+(.+)$/gm, () => {
			listCounter++
			return `${listCounter}. $1`
		})

		// Convert blockquotes
		// {quote}quote{quote} → > quote
		markdown = markdown.replace(/\{quote\}(.+?)\{quote\}/g, '> $1')

		// Convert horizontal rules
		// ---- → ---
		markdown = markdown.replace(/^----+$/gm, '---')

		return markdown
	}
}
