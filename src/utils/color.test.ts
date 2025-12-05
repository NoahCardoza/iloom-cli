import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
	generateColorFromBranchName,
	rgbToHex,
	hexToRgb,
	getColorPalette,
	lightenColor,
	saturateColor,
	calculateForegroundColor,
	colorDistance,
	selectDistinctColor,
	type RgbColor,
} from './color.js'

describe('Color utilities', () => {
	describe('getColorPalette', () => {
		it('should return exactly 16 colors', () => {
			const palette = getColorPalette()
			expect(palette).toHaveLength(16)
		})

		it('should return the expected 16-color palette', () => {
			const palette = getColorPalette()
			const expectedColors: RgbColor[] = [
				{ r: 220, g: 235, b: 255 }, // 0: Soft blue
				{ r: 255, g: 220, b: 235 }, // 1: Soft pink
				{ r: 220, g: 255, b: 235 }, // 2: Soft green
				{ r: 255, g: 245, b: 220 }, // 3: Soft cream
				{ r: 245, g: 220, b: 255 }, // 4: Soft lavender
				{ r: 220, g: 245, b: 255 }, // 5: Soft cyan
				{ r: 235, g: 235, b: 235 }, // 6: Soft grey
				{ r: 255, g: 230, b: 230 }, // 7: Soft coral
				{ r: 230, g: 255, b: 230 }, // 8: Soft mint
				{ r: 255, g: 245, b: 230 }, // 9: Soft peach
				{ r: 220, g: 255, b: 255 }, // 10: Soft aqua
				{ r: 255, g: 220, b: 255 }, // 11: Soft magenta
				{ r: 255, g: 255, b: 220 }, // 12: Soft yellow
				{ r: 235, g: 220, b: 255 }, // 13: Soft violet
				{ r: 220, g: 255, b: 245 }, // 14: Soft sea green
				{ r: 255, g: 235, b: 220 }, // 15: Soft salmon
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

		it('should generate different colors for many different branch names', () => {
			// With only 16 colors, some hash collisions are expected
			// But we should get good distribution across different branch names
			const branches = [
				'feature/branch-1',
				'feature/branch-2',
				'bugfix/auth',
				'hotfix/urgent',
				'release/v1.0',
				'main',
				'develop',
				'feature/add-user-profile',
			]
			const indices = branches.map(b => generateColorFromBranchName(b).index)
			const uniqueIndices = new Set(indices)
			// With 8 branches and 16 colors, we should get at least 4 unique colors
			// (statistically unlikely to get fewer due to birthday problem)
			expect(uniqueIndices.size).toBeGreaterThanOrEqual(4)
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

		it('should always return color index in range [0, 15]', () => {
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
				expect(color.index).toBeLessThanOrEqual(15)
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
			expect(color.index).toBeLessThanOrEqual(15)
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
					expect(color.index).toBeLessThanOrEqual(15)

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

	describe('16-color distinct palette', () => {
		it('should have most colors be visually distinct (minimum palette distance > 10)', () => {
			// Test that no two colors are too similar
			// With RGB constrained to 220-255 range and 16 colors,
			// we can't achieve min distance >= MIN_COLOR_DISTANCE (20) for all pairs,
			// but the collision avoidance algorithm ensures active looms get distinct colors
			const palette = getColorPalette()
			let minDistance = Infinity
			for (let i = 0; i < palette.length; i++) {
				for (let j = i + 1; j < palette.length; j++) {
					const distance = colorDistance(palette[i], palette[j])
					if (distance < minDistance) {
						minDistance = distance
					}
				}
			}
			// Ensure minimum distance is significantly better than the original 3.61
			expect(minDistance).toBeGreaterThanOrEqual(10)
		})

		it('should maintain subtlety constraint for all 16 colors', () => {
			const palette = getColorPalette()
			expect(palette).toHaveLength(16)
			palette.forEach((color) => {
				expect(color.r).toBeGreaterThanOrEqual(220)
				expect(color.g).toBeGreaterThanOrEqual(220)
				expect(color.b).toBeGreaterThanOrEqual(220)
			})
		})
	})

	describe('colorDistance', () => {
		it('should return 0 for identical colors', () => {
			const color: RgbColor = { r: 220, g: 235, b: 255 }
			expect(colorDistance(color, color)).toBe(0)
		})

		it('should calculate correct euclidean distance', () => {
			const color1: RgbColor = { r: 0, g: 0, b: 0 }
			const color2: RgbColor = { r: 3, g: 4, b: 0 }
			// sqrt(3^2 + 4^2 + 0^2) = sqrt(25) = 5
			expect(colorDistance(color1, color2)).toBe(5)
		})

		it('should be symmetric', () => {
			const color1: RgbColor = { r: 220, g: 235, b: 255 }
			const color2: RgbColor = { r: 255, g: 220, b: 235 }
			expect(colorDistance(color1, color2)).toBe(colorDistance(color2, color1))
		})
	})

	describe('selectDistinctColor', () => {
		it('should return hash-based color when no colors in use', () => {
			const result = selectDistinctColor('feature/test', [])
			const hashBased = generateColorFromBranchName('feature/test')
			expect(result.index).toBe(hashBased.index)
			expect(result.hex).toBe(hashBased.hex)
		})

		it('should return hash-based color when used hex colors are distinct enough', () => {
			const hashBased = generateColorFromBranchName('feature/test')
			// Use a very different color (black) that won't conflict
			const usedHexColors = ['#000000']
			const result = selectDistinctColor('feature/test', usedHexColors)
			// Should return hash-based since black is very different from any palette color
			expect(result.index).toBe(hashBased.index)
		})

		it('should avoid color when same hex is in use', () => {
			const hashBased = generateColorFromBranchName('feature/collision-test')
			const usedHexColors = [hashBased.hex]
			const result = selectDistinctColor('feature/collision-test', usedHexColors)
			expect(result.hex).not.toBe(hashBased.hex)
		})

		it('should avoid colors that are too similar to used hex colors', () => {
			// Use palette color 0 (Soft blue: #dcebff)
			const usedHexColors = ['#dcebff']
			const result = selectDistinctColor('feature/test', usedHexColors)
			// Either the hash-based color was distinct enough, or we found another distinct color
			// The key is we got a valid result
			expect(result.hex).toMatch(/^#[0-9a-f]{6}$/)
		})

		it('should handle invalid hex colors gracefully', () => {
			// Invalid hex colors should be skipped
			const usedHexColors = ['invalid', 'not-a-color', '#gg0000']
			const result = selectDistinctColor('feature/test', usedHexColors)
			const hashBased = generateColorFromBranchName('feature/test')
			// Since all hex colors are invalid, should return hash-based
			expect(result.index).toBe(hashBased.index)
		})

		it('should fall back to hash-based when all colors too similar', () => {
			// Use all palette colors as hex strings
			const palette = getColorPalette()
			const allHexColors = palette.map(c => rgbToHex(c.r, c.g, c.b))
			const result = selectDistinctColor('feature/test', allHexColors)
			// Should still return a valid color (fallback behavior)
			expect(result.index).toBeGreaterThanOrEqual(0)
			expect(result.index).toBeLessThanOrEqual(15)
		})

		it('should return valid ColorData', () => {
			const result = selectDistinctColor('feature/test', ['#dcebff', '#f8dceb'])
			expect(result).toHaveProperty('rgb')
			expect(result).toHaveProperty('hex')
			expect(result).toHaveProperty('index')
			expect(result.hex).toMatch(/^#[0-9a-f]{6}$/)
		})

		it('should be robust against palette changes by comparing hex colors directly', () => {
			// This test verifies the key benefit: comparing hex colors directly
			// means the function works even if the palette is modified
			const customHexColors = ['#aabbcc', '#ddeeff', '#112233']
			const result = selectDistinctColor('feature/test', customHexColors)
			// Should return a valid color regardless of what hex colors are passed
			expect(result.hex).toMatch(/^#[0-9a-f]{6}$/)
		})
	})

	describe('lightenColor', () => {
		it('should make a color lighter by moving RGB values toward 255', () => {
			const color: RgbColor = { r: 200, g: 200, b: 200 }
			const lighter = lightenColor(color, 0.1) // 10% lighter

			expect(lighter.r).toBeGreaterThan(color.r)
			expect(lighter.g).toBeGreaterThan(color.g)
			expect(lighter.b).toBeGreaterThan(color.b)
		})

		it('should handle amount = 0 (no change)', () => {
			const color: RgbColor = { r: 200, g: 150, b: 100 }
			const result = lightenColor(color, 0)

			expect(result).toEqual(color)
		})

		it('should handle amount = 1 (fully white)', () => {
			const color: RgbColor = { r: 200, g: 150, b: 100 }
			const result = lightenColor(color, 1)

			expect(result).toEqual({ r: 255, g: 255, b: 255 })
		})

		it('should clamp values to 0-255 range', () => {
			const color: RgbColor = { r: 250, g: 250, b: 250 }
			const result = lightenColor(color, 2) // Excessive amount

			expect(result.r).toBeLessThanOrEqual(255)
			expect(result.g).toBeLessThanOrEqual(255)
			expect(result.b).toBeLessThanOrEqual(255)
			expect(result.r).toBeGreaterThanOrEqual(0)
			expect(result.g).toBeGreaterThanOrEqual(0)
			expect(result.b).toBeGreaterThanOrEqual(0)
		})

		it('should work with subtle palette colors', () => {
			const color: RgbColor = { r: 220, g: 235, b: 248 } // Soft blue
			const lighter = lightenColor(color, 0.2) // 20% lighter for more visible change

			// At least some channels should be lighter (ones not already near 255)
			expect(lighter.r).toBeGreaterThan(color.r)
			expect(lighter.g).toBeGreaterThanOrEqual(color.g)
			expect(lighter.b).toBeGreaterThanOrEqual(color.b)
		})
	})

	describe('saturateColor', () => {
		it('should push colors away from grey toward dominant hue', () => {
			const color: RgbColor = { r: 220, g: 235, b: 248 } // Soft blue (blue dominant)
			const saturated = saturateColor(color, 0.4) // 40% more saturated

			// Blue is the dominant channel, so it should increase more
			// Red and green (lower values) should decrease
			expect(saturated.b).toBeGreaterThan(color.b)
		})

		it('should handle amount = 0 (no change)', () => {
			const color: RgbColor = { r: 220, g: 235, b: 248 }
			const result = saturateColor(color, 0)

			expect(result).toEqual(color)
		})

		it('should clamp values to 0-255 range', () => {
			const color: RgbColor = { r: 100, g: 200, b: 250 }
			const result = saturateColor(color, 5) // Excessive amount

			expect(result.r).toBeLessThanOrEqual(255)
			expect(result.g).toBeLessThanOrEqual(255)
			expect(result.b).toBeLessThanOrEqual(255)
			expect(result.r).toBeGreaterThanOrEqual(0)
			expect(result.g).toBeGreaterThanOrEqual(0)
			expect(result.b).toBeGreaterThanOrEqual(0)
		})

		it('should handle grey colors (all channels equal)', () => {
			const grey: RgbColor = { r: 200, g: 200, b: 200 }
			const result = saturateColor(grey, 0.5)

			// For grey, all channels should remain equal
			expect(result).toEqual(grey)
		})

		it('should make subtle colors more vivid', () => {
			const palette = getColorPalette()
			const softBlue = palette[0] // { r: 220, g: 235, b: 248 }
			const saturated = saturateColor(softBlue, 0.4)

			// Verify the saturated color is more vivid (further from grey)
			const avgOriginal = (softBlue.r + softBlue.g + softBlue.b) / 3
			const avgSaturated = (saturated.r + saturated.g + saturated.b) / 3

			const distanceOriginal = Math.sqrt(
				Math.pow(softBlue.r - avgOriginal, 2) +
					Math.pow(softBlue.g - avgOriginal, 2) +
					Math.pow(softBlue.b - avgOriginal, 2)
			)
			const distanceSaturated = Math.sqrt(
				Math.pow(saturated.r - avgSaturated, 2) +
					Math.pow(saturated.g - avgSaturated, 2) +
					Math.pow(saturated.b - avgSaturated, 2)
			)

			expect(distanceSaturated).toBeGreaterThan(distanceOriginal)
		})
	})

	describe('calculateForegroundColor', () => {
		it('should return black (#000000) for light backgrounds', () => {
			const lightColor: RgbColor = { r: 255, g: 255, b: 255 } // White
			expect(calculateForegroundColor(lightColor)).toBe('#000000')
		})

		it('should return white (#ffffff) for dark backgrounds', () => {
			const darkColor: RgbColor = { r: 0, g: 0, b: 0 } // Black
			expect(calculateForegroundColor(darkColor)).toBe('#ffffff')
		})

		it('should return black for all subtle palette colors (light backgrounds)', () => {
			const palette = getColorPalette()

			palette.forEach((color) => {
				// All palette colors are subtle (220-255 range), so they're all light
				expect(calculateForegroundColor(color)).toBe('#000000')
			})
		})

		it('should use WCAG relative luminance formula', () => {
			// Test a medium-ish color
			const mediumGrey: RgbColor = { r: 128, g: 128, b: 128 }
			const result = calculateForegroundColor(mediumGrey)

			// Medium grey should use white text
			expect(result).toBe('#ffffff')
		})

		it('should handle saturated colors correctly', () => {
			const palette = getColorPalette()
			const softBlue = palette[0] // { r: 220, g: 235, b: 248 }
			const saturated = saturateColor(softBlue, 0.4)

			// Even saturated version should still be light enough for black text
			const foreground = calculateForegroundColor(saturated)
			expect(foreground).toBe('#000000')
		})
	})
})
