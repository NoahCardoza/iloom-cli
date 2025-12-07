import { describe, it, expect } from 'vitest'
import { capitalizeFirstLetter } from './text.js'

describe('capitalizeFirstLetter', () => {
	describe('basic capitalization', () => {
		it('capitalizes lowercase first letter', () => {
			expect(capitalizeFirstLetter('hello world')).toBe('Hello world')
		})

		it('keeps already capitalized first letter', () => {
			expect(capitalizeFirstLetter('Hello world')).toBe('Hello world')
		})

		it('handles single character', () => {
			expect(capitalizeFirstLetter('a')).toBe('A')
			expect(capitalizeFirstLetter('A')).toBe('A')
		})
	})

	describe('space-prefix override', () => {
		it('strips leading space and does not capitalize', () => {
			expect(capitalizeFirstLetter(' iPhone feature')).toBe('iPhone feature')
		})

		it('handles single space followed by lowercase', () => {
			expect(capitalizeFirstLetter(' hello')).toBe('hello')
		})

		it('handles single space followed by uppercase', () => {
			expect(capitalizeFirstLetter(' Hello')).toBe('Hello')
		})

		it('handles single space only', () => {
			expect(capitalizeFirstLetter(' ')).toBe('')
		})
	})

	describe('edge cases', () => {
		it('returns empty string unchanged', () => {
			expect(capitalizeFirstLetter('')).toBe('')
		})

		it('handles strings starting with numbers', () => {
			expect(capitalizeFirstLetter('123 test')).toBe('123 test')
		})

		it('handles strings starting with punctuation', () => {
			expect(capitalizeFirstLetter('...test')).toBe('...test')
			expect(capitalizeFirstLetter('#hashtag')).toBe('#hashtag')
		})

		it('handles strings starting with emoji', () => {
			expect(capitalizeFirstLetter('🚀 launch feature')).toBe('🚀 launch feature')
		})

		it('preserves internal capitalization', () => {
			expect(capitalizeFirstLetter('camelCase')).toBe('CamelCase')
		})

		it('preserves whitespace after first character', () => {
			expect(capitalizeFirstLetter('a   b   c')).toBe('A   b   c')
		})
	})

	describe('unicode support', () => {
		it('capitalizes unicode letters', () => {
			expect(capitalizeFirstLetter('über')).toBe('Über')
			expect(capitalizeFirstLetter('éclair')).toBe('Éclair')
		})

		it('handles non-latin scripts (no capitalization concept)', () => {
			// These scripts don't have case, so they remain unchanged
			expect(capitalizeFirstLetter('日本語')).toBe('日本語')
			expect(capitalizeFirstLetter('עברית')).toBe('עברית')
		})
	})

	describe('multi-line strings', () => {
		it('only capitalizes first character of entire string', () => {
			const input = 'first line\nsecond line\nthird line'
			const expected = 'First line\nsecond line\nthird line'
			expect(capitalizeFirstLetter(input)).toBe(expected)
		})
	})
})
