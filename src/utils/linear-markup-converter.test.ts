import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { LinearMarkupConverter } from './linear-markup-converter.js'
import { readFileSync, existsSync, unlinkSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('LinearMarkupConverter', () => {
	describe('convertDetailsToLinear', () => {
		test('converts basic details/summary block', () => {
			const input = `<details>
<summary>Header</summary>
CONTENT
</details>`

			const expected = `+++ Header

CONTENT

+++`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})

		test('handles multiple details blocks', () => {
			const input = `First block:
<details>
<summary>First Header</summary>
First content
</details>

Some text in between

<details>
<summary>Second Header</summary>
Second content
</details>`

			const expected = `First block:
+++ First Header

First content

+++

Some text in between

+++ Second Header

Second content

+++`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})

		test('handles extra whitespace before and after content', () => {
			const input = `<details>
<summary>Header</summary>


Content with extra newlines


</details>`

			const expected = `+++ Header

Content with extra newlines

+++`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})

		test('handles whitespace in summary tag', () => {
			const input = `<details>
<summary>  Header with spaces  </summary>
Content
</details>`

			const expected = `+++ Header with spaces

Content

+++`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})

		test('handles empty content', () => {
			const input = `<details>
<summary>Header</summary>
</details>`

			const expected = `+++ Header

+++`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})

		test('handles content with code blocks', () => {
			const input = `<details>
<summary>Error Details</summary>

\`\`\`typescript
const error = new Error('test')
console.log(error)
\`\`\`

</details>`

			const expected = `+++ Error Details

\`\`\`typescript
const error = new Error('test')
console.log(error)
\`\`\`

+++`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})

		test('handles content with lists', () => {
			const input = `<details>
<summary>Todo List</summary>

- Item 1
- Item 2
- Item 3

</details>`

			const expected = `+++ Todo List

- Item 1
- Item 2
- Item 3

+++`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})

		test('normalizes excessive blank lines in content', () => {
			const input = `<details>
<summary>Header</summary>

Content line 1


Content line 2



Content line 3

</details>`

			const expected = `+++ Header

Content line 1

Content line 2

Content line 3

+++`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})

		test('handles details tag with attributes', () => {
			const input = `<details open>
<summary>Expanded by Default</summary>
Content here
</details>`

			const expected = `+++ Expanded by Default

Content here

+++`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})

		test('handles summary tag with attributes', () => {
			const input = `<details>
<summary class="custom-class" id="test-id">Header</summary>
Content here
</details>`

			const expected = `+++ Header

Content here

+++`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})

		test('handles HTML entities in summary', () => {
			const input = `<details>
<summary>&lt;Component&gt; Details</summary>
Content here
</details>`

			const expected = `+++ <Component> Details

Content here

+++`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})

		test('handles mixed content with details blocks', () => {
			const input = `# Test Plan

## Phase 1: Analysis

Some description here

<details>
<summary>Click to see detailed steps</summary>

1. First step
2. Second step
3. Third step

</details>

## Phase 2: Implementation

More content here`

			const expected = `# Test Plan

## Phase 1: Analysis

Some description here

+++ Click to see detailed steps

1. First step
2. Second step
3. Third step

+++

## Phase 2: Implementation

More content here`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})

		test('handles nested markdown formatting in content', () => {
			const input = `<details>
<summary>Complex Content</summary>

**Bold text**

*Italic text*

[Link](https://example.com)

> Quote

</details>`

			const expected = `+++ Complex Content

**Bold text**

*Italic text*

[Link](https://example.com)

> Quote

+++`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})

		test('preserves content that is not in details blocks', () => {
			const input = `Regular text

<details>
<summary>Collapsible</summary>
Hidden content
</details>

More regular text`

			const expected = `Regular text

+++ Collapsible

Hidden content

+++

More regular text`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})

		test('handles real-world workflow phase example', () => {
			const input = `## Phase 3: Implementation

Status: \`in_progress\`

<details>
<summary>Click to see implementation progress</summary>

### Completed Tasks
- [x] Create LinearMarkupConverter utility class
- [x] Write comprehensive unit tests

### In Progress
- [ ] Integrate converter into Linear MCP provider

### Pending
- [ ] Run tests to verify functionality
- [ ] Build the project

</details>

Last updated: 2025-12-02`

			const expected = `## Phase 3: Implementation

Status: \`in_progress\`

+++ Click to see implementation progress

### Completed Tasks
- [x] Create LinearMarkupConverter utility class
- [x] Write comprehensive unit tests

### In Progress
- [ ] Integrate converter into Linear MCP provider

### Pending
- [ ] Run tests to verify functionality
- [ ] Build the project

+++

Last updated: 2025-12-02`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})

		test('returns empty string for empty input', () => {
			expect(LinearMarkupConverter.convertDetailsToLinear('')).toBe('')
		})

		test('returns null for null input', () => {
			expect(LinearMarkupConverter.convertDetailsToLinear(null as unknown as string)).toBe(null)
		})

		test('returns undefined for undefined input', () => {
			expect(LinearMarkupConverter.convertDetailsToLinear(undefined as unknown as string)).toBe(undefined)
		})

		test('returns original text if no details blocks', () => {
			const input = `Just some regular text
with multiple lines
and no details blocks`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(input)
		})

		test('handles case-insensitive HTML tags', () => {
			const input = `<DETAILS>
<SUMMARY>Header</SUMMARY>
Content
</DETAILS>`

			const expected = `+++ Header

Content

+++`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})
	})

	describe('hasDetailsBlocks', () => {
		test('returns true when details blocks exist', () => {
			const input = `<details>
<summary>Header</summary>
Content
</details>`

			expect(LinearMarkupConverter.hasDetailsBlocks(input)).toBe(true)
		})

		test('returns true for multiple details blocks', () => {
			const input = `<details><summary>First</summary>Content</details>
<details><summary>Second</summary>Content</details>`

			expect(LinearMarkupConverter.hasDetailsBlocks(input)).toBe(true)
		})

		test('returns false when no details blocks', () => {
			const input = 'Just regular text'

			expect(LinearMarkupConverter.hasDetailsBlocks(input)).toBe(false)
		})

		test('returns false for empty string', () => {
			expect(LinearMarkupConverter.hasDetailsBlocks('')).toBe(false)
		})

		test('returns false for null', () => {
			expect(LinearMarkupConverter.hasDetailsBlocks(null as unknown as string)).toBe(false)
		})

		test('returns false for undefined', () => {
			expect(LinearMarkupConverter.hasDetailsBlocks(undefined as unknown as string)).toBe(false)
		})

		test('returns false for incomplete details tags', () => {
			const input = '<details><summary>Header'

			expect(LinearMarkupConverter.hasDetailsBlocks(input)).toBe(false)
		})

		test('returns true for details with attributes', () => {
			const input = '<details open><summary class="test">Header</summary>Content</details>'

			expect(LinearMarkupConverter.hasDetailsBlocks(input)).toBe(true)
		})
	})

	describe('convertToLinear', () => {
		test('applies all conversions', () => {
			const input = `<details>
<summary>Test</summary>
Content
</details>`

			const expected = `+++ Test

Content

+++`

			expect(LinearMarkupConverter.convertToLinear(input)).toBe(expected)
		})

		test('returns original text if no conversions needed', () => {
			const input = 'Regular text with no HTML'

			expect(LinearMarkupConverter.convertToLinear(input)).toBe(input)
		})

		test('handles empty input', () => {
			expect(LinearMarkupConverter.convertToLinear('')).toBe('')
		})

		test('handles null input', () => {
			expect(LinearMarkupConverter.convertToLinear(null as unknown as string)).toBe(null)
		})

		test('is extensible for future conversions', () => {
			// This test ensures the convertToLinear method can be extended
			// Currently only converts details blocks, but structure allows for more
			const input = `<details>
<summary>Current</summary>
Works now
</details>`

			const result = LinearMarkupConverter.convertToLinear(input)
			expect(result).toContain('+++')
			expect(result).toContain('Current')
		})
	})

	describe('edge cases and error handling', () => {
		test('handles malformed HTML gracefully', () => {
			const input = '<details><summary>Header</summary>Content' // Missing closing tag

			// Should not throw, just return original text
			expect(() => LinearMarkupConverter.convertDetailsToLinear(input)).not.toThrow()
			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(input)
		})

		test('handles missing summary tag', () => {
			const input = '<details>Content without summary</details>'

			// Should not throw, just return original text
			expect(() => LinearMarkupConverter.convertDetailsToLinear(input)).not.toThrow()
			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(input)
		})

		test('handles extremely long content', () => {
			const longContent = 'Line\n'.repeat(1000)
			const input = `<details>
<summary>Long Content</summary>
${longContent}
</details>`

			const result = LinearMarkupConverter.convertDetailsToLinear(input)
			expect(result).toContain('+++ Long Content')
			expect(result).toContain('+++')
			expect(result.length).toBeGreaterThan(longContent.length)
		})

		test('handles special characters in content', () => {
			const input = `<details>
<summary>Special Chars</summary>
!@#$%^&*()_+-=[]{}|;':",./<>?
</details>`

			const expected = `+++ Special Chars

!@#$%^&*()_+-=[]{}|;':",./<>?

+++`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})

		test('handles unicode characters', () => {
			const input = `<details>
<summary>Unicode Test 🚀</summary>
Content with émojis 🎉 and àccénts
</details>`

			const expected = `+++ Unicode Test 🚀

Content with émojis 🎉 and àccénts

+++`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})

		test('handles content with HTML tags that should be preserved', () => {
			const input = `<details>
<summary>HTML Content</summary>
Some text with <strong>bold</strong> and <em>italic</em>
</details>`

			const expected = `+++ HTML Content

Some text with <strong>bold</strong> and <em>italic</em>

+++`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})
	})

	describe('nested details blocks', () => {
		test('converts two-level nested details blocks', () => {
			const input = `Hello This Is Some Nested Content
			
<details><summary>Outer Header</summary>

This is some outer content

<details>
<summary>Inner Header</summary>
This is some inner content
</details>

</details>`

			const expected = `Hello This Is Some Nested Content
			
+++ Outer Header

This is some outer content

+++ Inner Header

This is some inner content

+++

+++`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})

		test('converts three-level nested details blocks', () => {
			const input = `<details>
<summary>Level 1</summary>

Content at level 1

<details>
<summary>Level 2</summary>

Content at level 2

<details>
<summary>Level 3</summary>
Content at level 3
</details>

</details>

</details>`

			const expected = `+++ Level 1

Content at level 1

+++ Level 2

Content at level 2

+++ Level 3

Content at level 3

+++

+++

+++`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})

		test('converts multiple nested blocks at same level', () => {
			const input = `<details>
<summary>Parent</summary>

<details>
<summary>Child 1</summary>
Content 1
</details>

<details>
<summary>Child 2</summary>
Content 2
</details>

</details>`

			const expected = `+++ Parent

+++ Child 1

Content 1

+++

+++ Child 2

Content 2

+++

+++`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})

		test('converts mixed nested and non-nested blocks', () => {
			const input = `<details>
<summary>First Block</summary>
Simple content
</details>

Some text in between

<details>
<summary>Nested Block</summary>

Outer content

<details>
<summary>Inner Block</summary>
Inner content
</details>

</details>`

			const expected = `+++ First Block

Simple content

+++

Some text in between

+++ Nested Block

Outer content

+++ Inner Block

Inner content

+++

+++`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})

		test('handles nested blocks with complex markdown content', () => {
			const input = `<details>
<summary>Test Plan</summary>

## Phase 1

<details>
<summary>Detailed Steps</summary>

1. First step
2. Second step

\`\`\`typescript
const test = 'example'
\`\`\`

</details>

## Phase 2

More content here

</details>`

			const expected = `+++ Test Plan

## Phase 1

+++ Detailed Steps

1. First step
2. Second step

\`\`\`typescript
const test = 'example'
\`\`\`

+++

## Phase 2

More content here

+++`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})

		test('handles nested blocks with empty inner content', () => {
			const input = `<details>
<summary>Outer</summary>

Some content

<details>
<summary>Inner Empty</summary>
</details>

More content

</details>`

			const expected = `+++ Outer

Some content

+++ Inner Empty

+++

More content

+++`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})

		test('handles deeply nested blocks (4 levels)', () => {
			const input = `<details>
<summary>L1</summary>
<details>
<summary>L2</summary>
<details>
<summary>L3</summary>
<details>
<summary>L4</summary>
Deepest content
</details>
</details>
</details>
</details>`

			const expected = `+++ L1

+++ L2

+++ L3

+++ L4

Deepest content

+++

+++

+++

+++`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})

		test('handles sibling nested blocks with different depths', () => {
			const input = `<details>
<summary>Block A</summary>

<details>
<summary>A1</summary>
<details>
<summary>A2</summary>
Deep content A
</details>
</details>

</details>

<details>
<summary>Block B</summary>

<details>
<summary>B1</summary>
Shallow content B
</details>

</details>`

			const expected = `+++ Block A

+++ A1

+++ A2

Deep content A

+++

+++

+++

+++ Block B

+++ B1

Shallow content B

+++

+++`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})

		test('handles nested blocks with mixed whitespace', () => {
			const input = `<details>
<summary>Outer</summary>


<details>
<summary>Inner</summary>


Content with spaces


</details>


</details>`

			const expected = `+++ Outer

+++ Inner

Content with spaces

+++

+++`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})

		test('handles real-world nested workflow example', () => {
			const input = `## Implementation Progress

<details>
<summary>Click to expand full details</summary>

### Phase 1: Setup
- [x] Create files
- [x] Write tests

<details>
<summary>Technical Details</summary>

#### Architecture
- Component structure
- Data flow

<details>
<summary>Code Examples</summary>

\`\`\`typescript
class Example {
  // code here
}
\`\`\`

</details>

</details>

### Phase 2: Testing
- [ ] Run tests

</details>`

			const expected = `## Implementation Progress

+++ Click to expand full details

### Phase 1: Setup
- [x] Create files
- [x] Write tests

+++ Technical Details

#### Architecture
- Component structure
- Data flow

+++ Code Examples

\`\`\`typescript
class Example {
  // code here
}
\`\`\`

+++

+++

### Phase 2: Testing
- [ ] Run tests

+++`

			expect(LinearMarkupConverter.convertDetailsToLinear(input)).toBe(expected)
		})
	})

	describe('removeCodeSampleWrappers', () => {
		test('removes wrapper from details block with "45 lines" in summary', () => {
			const input = `<details>
<summary>Click to expand complete test structure (45 lines)</summary>

\`\`\`typescript
const test = 'example'
console.log(test)
\`\`\`

</details>`

			const expected = `\`\`\`typescript
const test = 'example'
console.log(test)
\`\`\``.trim()

			expect(LinearMarkupConverter.removeCodeSampleWrappers(input).trim()).toBe(expected)
		})

		test('removes wrapper from details block with "120 lines" in summary', () => {
			const input = `<details>
<summary>Click to expand complete implementation (120 lines)</summary>
Implementation code here
</details>`

			const expected = 'Implementation code here'

			expect(LinearMarkupConverter.removeCodeSampleWrappers(input).trim()).toBe(expected)
		})

		test('removes wrapper from details block with various line count patterns', () => {
			const patterns = [
				'1 lines',
				'10 lines',
				'100 lines',
				'1000 lines',
				'5 lines of code',
				'Complete code (80 lines)',
			]

			patterns.forEach((pattern) => {
				const input = `<details><summary>${pattern}</summary>Content here</details>`
				const result = LinearMarkupConverter.removeCodeSampleWrappers(input)
				expect(result.trim()).toBe('Content here')
			})
		})

		test('does not remove regular details blocks without line count', () => {
			const input = `<details>
<summary>Regular Header</summary>
Content here
</details>`

			// Should remain unchanged - no line count pattern
			expect(LinearMarkupConverter.removeCodeSampleWrappers(input)).toBe(input)
		})

		test('preserves content structure when removing wrappers', () => {
			const input = `<details>
<summary>Code example (60 lines)</summary>

## Section Title

- List item 1
- List item 2

\`\`\`typescript
function test() {
  return true
}
\`\`\`

</details>`

			const expected = `## Section Title

- List item 1
- List item 2

\`\`\`typescript
function test() {
  return true
}
\`\`\``.trim()

			expect(LinearMarkupConverter.removeCodeSampleWrappers(input).trim()).toBe(expected)
		})

		test('handles multiple code sample blocks in same text', () => {
			const input = `First block:
<details>
<summary>Example 1 (30 lines)</summary>
Code 1
</details>

Some text between

<details>
<summary>Example 2 (50 lines)</summary>
Code 2
</details>`

			const result = LinearMarkupConverter.removeCodeSampleWrappers(input)
			expect(result).toContain('Code 1')
			expect(result).toContain('Code 2')
			expect(result).not.toContain('<details>')
			expect(result).not.toContain('<summary>')
			expect(result).not.toContain('Example 1 (30 lines)')
			expect(result).not.toContain('Example 2 (50 lines)')
		})

		test('handles details block with attributes on tags', () => {
			const input = `<details open class="test">
<summary id="test-id">Click to expand (45 lines)</summary>
Content here
</details>`

			expect(LinearMarkupConverter.removeCodeSampleWrappers(input).trim()).toBe('Content here')
		})

		test('handles empty content in code sample block', () => {
			const input = `<details>
<summary>Empty code (0 lines)</summary>
</details>`

			expect(LinearMarkupConverter.removeCodeSampleWrappers(input).trim()).toBe('')
		})

		test('handles extra whitespace in code sample blocks', () => {
			const input = `<details>
<summary>Code (40 lines)</summary>


Content with spaces


</details>`

			// Trim should normalize whitespace
			expect(LinearMarkupConverter.removeCodeSampleWrappers(input).trim()).toBe('Content with spaces')
		})

		test('returns empty string for empty input', () => {
			expect(LinearMarkupConverter.removeCodeSampleWrappers('')).toBe('')
		})

		test('returns null for null input', () => {
			expect(LinearMarkupConverter.removeCodeSampleWrappers(null as unknown as string)).toBe(null)
		})

		test('returns undefined for undefined input', () => {
			expect(LinearMarkupConverter.removeCodeSampleWrappers(undefined as unknown as string)).toBe(undefined)
		})

		test('handles case-insensitive HTML tags', () => {
			const input = `<DETAILS>
<SUMMARY>Code (50 lines)</SUMMARY>
Content
</DETAILS>`

			expect(LinearMarkupConverter.removeCodeSampleWrappers(input).trim()).toBe('Content')
		})

		test('handles line count with different spacing', () => {
			const spacingVariants = [
				'45 lines',
				'45  lines',
				'45\tlines',
			]

			spacingVariants.forEach((variant) => {
				const input = `<details><summary>Code (${variant})</summary>Content</details>`
				const result = LinearMarkupConverter.removeCodeSampleWrappers(input)
				expect(result.trim()).toBe('Content')
			})
		})
	})

	describe('convertToLinear with code sample blocks', () => {
		test('unwraps code sample blocks and converts regular blocks', () => {
			const input = `<details>
<summary>Regular collapsible section</summary>
This should be converted to Linear format
</details>

<details>
<summary>Code example (45 lines)</summary>
This should be unwrapped without wrapper tags
</details>`

			const result = LinearMarkupConverter.convertToLinear(input)

			// Regular block should be converted to +++
			expect(result).toContain('+++ Regular collapsible section')
			expect(result).toContain('This should be converted to Linear format')

			// Code sample block should be unwrapped (no wrapper tags and no summary text)
			expect(result).toContain('This should be unwrapped without wrapper tags')
			expect(result).not.toContain('Code example (45 lines)')

			// Should have exactly 2 +++ for the regular block (opening + closing)
			const plusMatches = result.match(/\+\+\+/g)
			expect(plusMatches?.length).toBe(2) // Only 2 for the regular block (opening + closing)
		})

		test('handles mixed nested scenarios correctly', () => {
			const input = `<details>
<summary>Outer regular block</summary>

Some content

<details>
<summary>Code sample (60 lines)</summary>
Code content that should be unwrapped
</details>

More content

</details>`

			const result = LinearMarkupConverter.convertToLinear(input)

			// Outer block should be converted
			expect(result).toContain('+++ Outer regular block')

			// Code sample should be unwrapped (no +++ for it)
			expect(result).toContain('Code content that should be unwrapped')
			expect(result).not.toContain('Code sample (60 lines)')
		})

		test('processes code samples before regular details conversion', () => {
			const input = `<details>
<summary>Implementation details (80 lines)</summary>

\`\`\`typescript
class Example {
  test() {
    return true
  }
}
\`\`\`

</details>

<details>
<summary>Click to expand more info</summary>
Additional information here
</details>`

			const result = LinearMarkupConverter.convertToLinear(input)

			// Code sample should be unwrapped
			expect(result).toContain('class Example')
			expect(result).not.toContain('Implementation details (80 lines)')

			// Regular block should be converted
			expect(result).toContain('+++ Click to expand more info')
			expect(result).toContain('Additional information here')
		})

		test('handles only code sample blocks with no regular blocks', () => {
			const input = `# Documentation

<details>
<summary>Complete test structure (45 lines)</summary>

\`\`\`typescript
describe('test', () => {
  it('works', () => {
    expect(true).toBe(true)
  })
})
\`\`\`

</details>

## Next Section`

			const result = LinearMarkupConverter.convertToLinear(input)

			// Should unwrap but not convert to +++
			expect(result).toContain('# Documentation')
			expect(result).toContain('## Next Section')
			expect(result).toContain("describe('test'")
			expect(result).not.toContain('Complete test structure (45 lines)')
			expect(result).not.toContain('+++')
		})

		test('handles only regular blocks with no code samples', () => {
			const input = `<details>
<summary>Regular Block 1</summary>
Content 1
</details>

<details>
<summary>Regular Block 2</summary>
Content 2
</details>`

			const result = LinearMarkupConverter.convertToLinear(input)

			// Both should be converted to +++
			expect(result).toContain('+++ Regular Block 1')
			expect(result).toContain('+++ Regular Block 2')

			const plusMatches = result.match(/\+\+\+/g)
			expect(plusMatches?.length).toBe(4) // 2 blocks × 2 (opening + closing)
		})

		test('real-world workflow example with mixed blocks', () => {
			const input = `## Implementation Progress

<details>
<summary>Click to see phase details</summary>

### Phase 1: Setup
- [x] Create files
- [x] Write tests

<details>
<summary>Complete test structure (45 lines)</summary>

\`\`\`typescript
describe('LinearMarkupConverter', () => {
  test('converts details blocks', () => {
    // test code
  })
})
\`\`\`

</details>

### Phase 2: Testing
- [ ] Run tests

</details>`

			const result = LinearMarkupConverter.convertToLinear(input)

			// Outer regular block should be converted
			expect(result).toContain('+++ Click to see phase details')

			// Code sample should be unwrapped (no +++ for it, and summary removed)
			expect(result).toContain("describe('LinearMarkupConverter'")
			expect(result).not.toContain('Complete test structure (45 lines)')

			// Should have the phase content
			expect(result).toContain('### Phase 1: Setup')
			expect(result).toContain('### Phase 2: Testing')
		})
	})

	describe('logging functionality', () => {
		let originalEnv: string | undefined
		let logFiles: string[] = []

		beforeEach(() => {
			// Save original env var
			originalEnv = process.env.LINEAR_MARKDOWN_LOG_FILE
			delete process.env.LINEAR_MARKDOWN_LOG_FILE
			logFiles = []
		})

		afterEach(() => {
			// Restore original env var
			if (originalEnv !== undefined) {
				process.env.LINEAR_MARKDOWN_LOG_FILE = originalEnv
			} else {
				delete process.env.LINEAR_MARKDOWN_LOG_FILE
			}

			// Clean up any log files created during tests
			logFiles.forEach((file) => {
				try {
					if (existsSync(file)) {
						unlinkSync(file)
					}
				} catch {
					// Ignore cleanup errors
				}
			})
		})

		test('does not log when LINEAR_MARKDOWN_LOG_FILE is not set', () => {
			const input = `<details>
<summary>Test</summary>
Content
</details>`

			// Ensure env var is not set
			delete process.env.LINEAR_MARKDOWN_LOG_FILE

			// Should not throw and should work normally
			const result = LinearMarkupConverter.convertToLinear(input)
			expect(result).toContain('+++')
		})

		test('logs input and output when LINEAR_MARKDOWN_LOG_FILE is set', () => {
			const logPath = join(tmpdir(), 'test-linear-log.log')
			process.env.LINEAR_MARKDOWN_LOG_FILE = logPath

			const input = `<details>
<summary>Test Header</summary>
Test content
</details>`

			LinearMarkupConverter.convertToLinear(input)

			// Find the timestamped log file
			const timestampPattern = /test-linear-log-\d{8}-\d{6}\.log$/
			const logDir = tmpdir()
			const files = readdirSync(logDir)
			const logFile = files
				.map((f: string) => join(logDir, f))
				.find((f: string) => timestampPattern.test(f))

			expect(logFile).toBeDefined()
			if (logFile) {
				logFiles.push(logFile)

				const logContent = readFileSync(logFile, 'utf-8')

				// Check for input section
				expect(logContent).toContain('CONVERSION INPUT')
				expect(logContent).toContain('INPUT:')
				expect(logContent).toContain('<details>')
				expect(logContent).toContain('<summary>Test Header</summary>')

				// Check for output section
				expect(logContent).toContain('CONVERSION OUTPUT')
				expect(logContent).toContain('OUTPUT:')
				expect(logContent).toContain('+++ Test Header')
				expect(logContent).toContain('+++')

				// Check for timestamps
				expect(logContent).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/)

				// Check for separators
				expect(logContent).toContain('================================')
			}
		})

		test('creates timestamped log file names correctly', () => {
			const logPath = join(tmpdir(), 'debug.log')
			process.env.LINEAR_MARKDOWN_LOG_FILE = logPath

			const input = 'Simple test'
			LinearMarkupConverter.convertToLinear(input)

			// Find the timestamped log file
			const timestampPattern = /debug-\d{8}-\d{6}\.log$/
			const logDir = tmpdir()
			const files = readdirSync(logDir)
			const logFile = files
				.map((f: string) => join(logDir, f))
				.find((f: string) => timestampPattern.test(f))

			expect(logFile).toBeDefined()
			if (logFile) {
				logFiles.push(logFile)
				expect(logFile).toMatch(/debug-\d{8}-\d{6}\.log$/)
			}
		})

		test('handles different file extensions correctly', () => {
			const logPath = join(tmpdir(), 'test-log.txt')
			process.env.LINEAR_MARKDOWN_LOG_FILE = logPath

			const input = 'Test'
			LinearMarkupConverter.convertToLinear(input)

			// Find the timestamped log file
			const timestampPattern = /test-log-\d{8}-\d{6}\.txt$/
			const logDir = tmpdir()
			const files = readdirSync(logDir)
			const logFile = files
				.map((f: string) => join(logDir, f))
				.find((f: string) => timestampPattern.test(f))

			expect(logFile).toBeDefined()
			if (logFile) {
				logFiles.push(logFile)
				expect(logFile).toMatch(/test-log-\d{8}-\d{6}\.txt$/)
			}
		})

		test('handles file path without extension correctly', () => {
			const logPath = join(tmpdir(), 'testlog')
			process.env.LINEAR_MARKDOWN_LOG_FILE = logPath

			const input = 'Test'
			LinearMarkupConverter.convertToLinear(input)

			// Find the timestamped log file
			const timestampPattern = /testlog-\d{8}-\d{6}$/
			const logDir = tmpdir()
			const files = readdirSync(logDir)
			const logFile = files
				.map((f: string) => join(logDir, f))
				.find((f: string) => timestampPattern.test(f))

			expect(logFile).toBeDefined()
			if (logFile) {
				logFiles.push(logFile)
				expect(logFile).toMatch(/testlog-\d{8}-\d{6}$/)
			}
		})

		test('does not crash on logging errors', () => {
			// Use an invalid path that will cause a write error
			process.env.LINEAR_MARKDOWN_LOG_FILE = '/nonexistent/directory/invalid.log'

			const input = `<details>
<summary>Test</summary>
Content
</details>`

			// Should not throw even though logging will fail
			expect(() => LinearMarkupConverter.convertToLinear(input)).not.toThrow()

			// Should still return correct output
			const result = LinearMarkupConverter.convertToLinear(input)
			expect(result).toContain('+++')
			expect(result).toContain('Test')
		})

		test('logs multiple conversions to the same file', () => {
			const logPath = join(tmpdir(), 'multi-conversion.log')
			process.env.LINEAR_MARKDOWN_LOG_FILE = logPath

			const input1 = `<details><summary>First</summary>Content 1</details>`
			const input2 = `<details><summary>Second</summary>Content 2</details>`

			LinearMarkupConverter.convertToLinear(input1)
			LinearMarkupConverter.convertToLinear(input2)

			// Find the timestamped log file
			const timestampPattern = /multi-conversion-\d{8}-\d{6}\.log$/
			const logDir = tmpdir()
			const files = readdirSync(logDir)
			const logFile = files
				.map((f: string) => join(logDir, f))
				.find((f: string) => timestampPattern.test(f))

			expect(logFile).toBeDefined()
			if (logFile) {
				logFiles.push(logFile)

				const logContent = readFileSync(logFile, 'utf-8')

				// Should have entries for both conversions
				expect(logContent).toContain('First')
				expect(logContent).toContain('Second')
				expect(logContent).toContain('Content 1')
				expect(logContent).toContain('Content 2')

				// Should have multiple INPUT and OUTPUT sections
				const inputMatches = logContent.match(/CONVERSION INPUT/g)
				const outputMatches = logContent.match(/CONVERSION OUTPUT/g)
				expect(inputMatches?.length).toBe(2)
				expect(outputMatches?.length).toBe(2)
			}
		})

		test('log format includes all required elements', () => {
			const logPath = join(tmpdir(), 'format-test.log')
			process.env.LINEAR_MARKDOWN_LOG_FILE = logPath

			const input = 'Test content'
			LinearMarkupConverter.convertToLinear(input)

			// Find the timestamped log file
			const timestampPattern = /format-test-\d{8}-\d{6}\.log$/
			const logDir = tmpdir()
			const files = readdirSync(logDir)
			const logFile = files
				.map((f: string) => join(logDir, f))
				.find((f: string) => timestampPattern.test(f))

			expect(logFile).toBeDefined()
			if (logFile) {
				logFiles.push(logFile)

				const logContent = readFileSync(logFile, 'utf-8')

				// Check for separators (should appear multiple times)
				const separatorMatches = logContent.match(/================================/g)
				expect(separatorMatches).toBeDefined()
				expect(separatorMatches!.length).toBeGreaterThanOrEqual(4) // At least 2 per conversion (input + output)

				// Check for timestamps in ISO format
				expect(logContent).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/)

				// Check for labels
				expect(logContent).toContain('INPUT:')
				expect(logContent).toContain('OUTPUT:')

				// Check for actual content
				expect(logContent).toContain('Test content')
			}
		})
	})
})
