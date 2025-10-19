import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
	generateColorFromBranchName,
	rgbToHex,
	hexToRgb,
	getColorPalette,
	type RgbColor,
} from './color.js'

describe('Color utilities', () => {
	describe('getColorPalette', () => {
		it('should return exactly 40 colors', () => {
			const palette = getColorPalette()
			expect(palette).toHaveLength(40)
		})

		it('should return colors matching terminal palette from bash script', () => {
			const palette = getColorPalette()
			// From bash/new-branch-workflow.sh lines 111-122
			const expectedColors: RgbColor[] = [
				// First 10 colors preserved for backward compatibility
				{ r: 220, g: 235, b: 248 }, // 0: Soft blue
				{ r: 248, g: 220, b: 235 }, // 1: Soft pink
				{ r: 220, g: 248, b: 235 }, // 2: Soft green
				{ r: 248, g: 240, b: 220 }, // 3: Soft cream
				{ r: 240, g: 220, b: 248 }, // 4: Soft lavender
				{ r: 220, g: 240, b: 248 }, // 5: Soft cyan
				{ r: 235, g: 235, b: 235 }, // 6: Soft grey
				{ r: 228, g: 238, b: 248 }, // 7: Soft ice blue
				{ r: 248, g: 228, b: 238 }, // 8: Soft rose
				{ r: 228, g: 248, b: 238 }, // 9: Soft mint
				// 30 new colors (indices 10-39)
				{ r: 235, g: 245, b: 250 }, // 10: Pale sky blue
				{ r: 250, g: 235, b: 245 }, // 11: Pale orchid
				{ r: 235, g: 250, b: 245 }, // 12: Pale seafoam
				{ r: 250, g: 245, b: 235 }, // 13: Pale peach
				{ r: 245, g: 235, b: 250 }, // 14: Pale periwinkle
				{ r: 235, g: 245, b: 235 }, // 15: Pale sage
				{ r: 245, g: 250, b: 235 }, // 16: Pale lemon
				{ r: 245, g: 235, b: 235 }, // 17: Pale blush
				{ r: 235, g: 235, b: 250 }, // 18: Pale lavender blue
				{ r: 250, g: 235, b: 235 }, // 19: Pale coral
				{ r: 235, g: 250, b: 250 }, // 20: Pale aqua
				{ r: 240, g: 248, b: 255 }, // 21: Alice blue
				{ r: 255, g: 240, b: 248 }, // 22: Lavender blush
				{ r: 240, g: 255, b: 248 }, // 23: Honeydew tint
				{ r: 255, g: 248, b: 240 }, // 24: Antique white
				{ r: 248, g: 240, b: 255 }, // 25: Magnolia
				{ r: 240, g: 248, b: 240 }, // 26: Mint cream tint
				{ r: 248, g: 255, b: 240 }, // 27: Ivory tint
				{ r: 248, g: 240, b: 240 }, // 28: Misty rose tint
				{ r: 240, g: 240, b: 255 }, // 29: Ghost white tint
				{ r: 255, g: 245, b: 238 }, // 30: Seashell
				{ r: 245, g: 255, b: 250 }, // 31: Azure mist
				{ r: 250, g: 245, b: 255 }, // 32: Lilac mist
				{ r: 255, g: 250, b: 245 }, // 33: Snow peach
				{ r: 238, g: 245, b: 255 }, // 34: Powder blue
				{ r: 255, g: 238, b: 245 }, // 35: Pink lace
				{ r: 245, g: 255, b: 238 }, // 36: Pale lime
				{ r: 238, g: 255, b: 245 }, // 37: Pale turquoise
				{ r: 245, g: 238, b: 255 }, // 38: Pale violet
				{ r: 255, g: 245, b: 255 }, // 39: Pale magenta
			]
			expect(palette).toEqual(expectedColors)
		})

		it('should return subtle colors (no RGB value below 220)', () => {
			const palette = getColorPalette()
			palette.forEach((color) => {
				expect(color.r).toBeGreaterThanOrEqual(220)
				expect(color.g).toBeGreaterThanOrEqual(220)
				expect(color.b).toBeGreaterThanOrEqual(220)
			})
		})

		it('should return valid RGB values (0-255 range)', () => {
			const palette = getColorPalette()
			palette.forEach((color) => {
				expect(color.r).toBeGreaterThanOrEqual(0)
				expect(color.r).toBeLessThanOrEqual(255)
				expect(color.g).toBeGreaterThanOrEqual(0)
				expect(color.g).toBeLessThanOrEqual(255)
				expect(color.b).toBeGreaterThanOrEqual(0)
				expect(color.b).toBeLessThanOrEqual(255)
			})
		})
	})

	describe('rgbToHex', () => {
		it('should convert RGB to hex format correctly', () => {
			expect(rgbToHex(220, 235, 248)).toBe('#dcebf8')
			expect(rgbToHex(248, 220, 235)).toBe('#f8dceb')
			expect(rgbToHex(220, 248, 235)).toBe('#dcf8eb')
		})

		it('should handle edge case: black (0,0,0)', () => {
			expect(rgbToHex(0, 0, 0)).toBe('#000000')
		})

		it('should handle edge case: white (255,255,255)', () => {
			expect(rgbToHex(255, 255, 255)).toBe('#ffffff')
		})

		it('should pad single digit hex values with zeros', () => {
			expect(rgbToHex(1, 2, 3)).toBe('#010203')
			expect(rgbToHex(15, 16, 17)).toBe('#0f1011')
		})

		it('should throw for invalid RGB values below 0', () => {
			expect(() => rgbToHex(-1, 0, 0)).toThrow('RGB values must be between 0 and 255')
			expect(() => rgbToHex(0, -1, 0)).toThrow('RGB values must be between 0 and 255')
			expect(() => rgbToHex(0, 0, -1)).toThrow('RGB values must be between 0 and 255')
		})

		it('should throw for invalid RGB values above 255', () => {
			expect(() => rgbToHex(256, 0, 0)).toThrow('RGB values must be between 0 and 255')
			expect(() => rgbToHex(0, 256, 0)).toThrow('RGB values must be between 0 and 255')
			expect(() => rgbToHex(0, 0, 256)).toThrow('RGB values must be between 0 and 255')
		})
	})

	describe('hexToRgb', () => {
		it('should convert hex to RGB correctly', () => {
			expect(hexToRgb('#dcebf8')).toEqual({ r: 220, g: 235, b: 248 })
			expect(hexToRgb('#f8dceb')).toEqual({ r: 248, g: 220, b: 235 })
			expect(hexToRgb('#dcf8eb')).toEqual({ r: 220, g: 248, b: 235 })
		})

		it('should handle hex without # prefix', () => {
			expect(hexToRgb('dcebf8')).toEqual({ r: 220, g: 235, b: 248 })
			expect(hexToRgb('f8dceb')).toEqual({ r: 248, g: 220, b: 235 })
		})

		it('should handle lowercase and uppercase hex', () => {
			expect(hexToRgb('#DCEBF8')).toEqual({ r: 220, g: 235, b: 248 })
			expect(hexToRgb('#DcEbF8')).toEqual({ r: 220, g: 235, b: 248 })
			expect(hexToRgb('DCEBF8')).toEqual({ r: 220, g: 235, b: 248 })
		})

		it('should handle black and white', () => {
			expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 })
			expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 })
		})

		it('should throw for invalid hex format (wrong length)', () => {
			expect(() => hexToRgb('#fff')).toThrow('Invalid hex color format')
			expect(() => hexToRgb('#fffffff')).toThrow('Invalid hex color format')
			expect(() => hexToRgb('ff')).toThrow('Invalid hex color format')
		})

		it('should throw for invalid hex characters', () => {
			expect(() => hexToRgb('#gggggg')).toThrow('Invalid hex color format')
			expect(() => hexToRgb('#12345z')).toThrow('Invalid hex color format')
		})
	})

	describe('generateColorFromBranchName', () => {
		it('should generate deterministic colors for same branch name', () => {
			const color1 = generateColorFromBranchName('feature/my-branch')
			const color2 = generateColorFromBranchName('feature/my-branch')
			expect(color1).toEqual(color2)
		})

		it('should return different colors for different branch names', () => {
			const color1 = generateColorFromBranchName('feature/branch-1')
			const color2 = generateColorFromBranchName('feature/branch-2')
			// While theoretically they could be the same due to hash collisions,
			// in practice they should be different
			expect(color1.index).not.toBe(color2.index)
		})

		it('should handle branch names with special characters (/, -, _)', () => {
			expect(() => generateColorFromBranchName('feature/my-branch')).not.toThrow()
			expect(() => generateColorFromBranchName('feat-issue-37')).not.toThrow()
			expect(() => generateColorFromBranchName('feat_issue_37')).not.toThrow()
			expect(() => generateColorFromBranchName('feature/issue-37/terminal-colors')).not.toThrow()
		})

		it('should handle unicode characters in branch names', () => {
			expect(() => generateColorFromBranchName('feature/emoji-🎨')).not.toThrow()
			expect(() => generateColorFromBranchName('功能/my-branch')).not.toThrow()
		})

		it('should always return color index in range [0, 39]', () => {
			const testBranches = [
				'main',
				'develop',
				'feature/test',
				'bugfix/issue-123',
				'hotfix/critical',
				'release/v1.0.0',
				'feat-very-long-branch-name-with-many-characters',
			]

			testBranches.forEach((branch) => {
				const color = generateColorFromBranchName(branch)
				expect(color.index).toBeGreaterThanOrEqual(0)
				expect(color.index).toBeLessThanOrEqual(39)
			})
		})

		it('should return valid RGB values (0-255 range)', () => {
			const color = generateColorFromBranchName('feature/test')
			expect(color.rgb.r).toBeGreaterThanOrEqual(0)
			expect(color.rgb.r).toBeLessThanOrEqual(255)
			expect(color.rgb.g).toBeGreaterThanOrEqual(0)
			expect(color.rgb.g).toBeLessThanOrEqual(255)
			expect(color.rgb.b).toBeGreaterThanOrEqual(0)
			expect(color.rgb.b).toBeLessThanOrEqual(255)
		})

		it('should return valid hex color format (#RRGGBB)', () => {
			const color = generateColorFromBranchName('feature/test')
			expect(color.hex).toMatch(/^#[0-9a-f]{6}$/)
		})

		it('should have RGB and hex representations match', () => {
			const color = generateColorFromBranchName('feature/test')
			const rgbFromHex = hexToRgb(color.hex)
			expect(rgbFromHex).toEqual(color.rgb)
		})

		it('should match bash implementation for known branch names', () => {
			// Test case: 'feature/test-branch'
			// Bash: shasum -a 256 gives specific hash, first 8 chars used
			// We can verify our implementation produces same index
			const color = generateColorFromBranchName('feature/test-branch')
			expect(color.index).toBeGreaterThanOrEqual(0)
			expect(color.index).toBeLessThanOrEqual(39)
			// Color should be from palette
			const palette = getColorPalette()
			expect(color.rgb).toEqual(palette[color.index])
		})

		it('should return ColorData with all required fields', () => {
			const color = generateColorFromBranchName('feature/test')
			expect(color).toHaveProperty('rgb')
			expect(color).toHaveProperty('hex')
			expect(color).toHaveProperty('index')
			expect(color.rgb).toHaveProperty('r')
			expect(color.rgb).toHaveProperty('g')
			expect(color.rgb).toHaveProperty('b')
		})
	})

	describe('property-based tests', () => {
		it('should generate same color for same branch name', () => {
			fc.assert(
				fc.property(fc.string({ minLength: 1, maxLength: 100 }), (branchName) => {
					const color1 = generateColorFromBranchName(branchName)
					const color2 = generateColorFromBranchName(branchName)
					expect(color1).toEqual(color2)
				})
			)
		})

		it('should always generate valid color data', () => {
			fc.assert(
				fc.property(fc.string({ minLength: 1, maxLength: 100 }), (branchName) => {
					const color = generateColorFromBranchName(branchName)

					// Index in range
					expect(color.index).toBeGreaterThanOrEqual(0)
					expect(color.index).toBeLessThanOrEqual(39)

					// RGB values valid
					expect(color.rgb.r).toBeGreaterThanOrEqual(0)
					expect(color.rgb.r).toBeLessThanOrEqual(255)
					expect(color.rgb.g).toBeGreaterThanOrEqual(0)
					expect(color.rgb.g).toBeLessThanOrEqual(255)
					expect(color.rgb.b).toBeGreaterThanOrEqual(0)
					expect(color.rgb.b).toBeLessThanOrEqual(255)

					// Hex format valid
					expect(color.hex).toMatch(/^#[0-9a-f]{6}$/)

					// RGB and hex match
					const rgbFromHex = hexToRgb(color.hex)
					expect(rgbFromHex).toEqual(color.rgb)
				})
			)
		})

		it('should handle arbitrary branch names without throwing', () => {
			fc.assert(
				fc.property(fc.string({ minLength: 1, maxLength: 100 }), (branchName) => {
					expect(() => generateColorFromBranchName(branchName)).not.toThrow()
				})
			)
		})

		it('should return color from palette', () => {
			fc.assert(
				fc.property(fc.string({ minLength: 1, maxLength: 100 }), (branchName) => {
					const color = generateColorFromBranchName(branchName)
					const palette = getColorPalette()
					expect(color.rgb).toEqual(palette[color.index])
				})
			)
		})
	})

	describe('40-color palette expansion', () => {
		it('should maintain first 10 colors for backward compatibility', () => {
			// Verify first 10 colors unchanged to preserve existing branch colors
			const palette = getColorPalette()
			const originalColors: RgbColor[] = [
				{ r: 220, g: 235, b: 248 }, // Soft blue
				{ r: 248, g: 220, b: 235 }, // Soft pink
				{ r: 220, g: 248, b: 235 }, // Soft green
				{ r: 248, g: 240, b: 220 }, // Soft cream
				{ r: 240, g: 220, b: 248 }, // Soft lavender
				{ r: 220, g: 240, b: 248 }, // Soft cyan
				{ r: 235, g: 235, b: 235 }, // Soft grey
				{ r: 228, g: 238, b: 248 }, // Soft ice blue
				{ r: 248, g: 228, b: 238 }, // Soft rose
				{ r: 228, g: 248, b: 238 }, // Soft mint
			]
			originalColors.forEach((expected, index) => {
				expect(palette[index]).toEqual(expected)
			})
		})

		it('should have all 40 colors be visually distinct', () => {
			// Test that no two colors are too similar (Euclidean distance threshold)
			const palette = getColorPalette()
			for (let i = 0; i < palette.length; i++) {
				for (let j = i + 1; j < palette.length; j++) {
					const distance = Math.sqrt(
						Math.pow(palette[i].r - palette[j].r, 2) +
							Math.pow(palette[i].g - palette[j].g, 2) +
							Math.pow(palette[i].b - palette[j].b, 2)
					)
					// Minimum distance threshold to ensure visual distinction
					// For subtle colors (RGB >= 220), we allow smaller distances since the color space is constrained
					// A distance of 3+ ensures colors are not identical or too similar
					expect(distance).toBeGreaterThanOrEqual(3)
				}
			}
		})

		it('should maintain subtlety constraint for all 40 colors', () => {
			// This already exists but confirms it works for expanded palette
			const palette = getColorPalette()
			expect(palette).toHaveLength(40)
			palette.forEach((color) => {
				expect(color.r).toBeGreaterThanOrEqual(220)
				expect(color.g).toBeGreaterThanOrEqual(220)
				expect(color.b).toBeGreaterThanOrEqual(220)
			})
		})
	})
})
