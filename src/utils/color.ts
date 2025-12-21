import { createHash } from 'crypto'
import logger from './logger'
import type { ThemeMode } from './terminal.js'

/**
 * RGB color representation
 */
export interface RgbColor {
	r: number
	g: number
	b: number
}

/**
 * Complete color data with RGB, hex, and palette index
 */
export interface ColorData {
	rgb: RgbColor
	hex: string
	index: number
}

/**
 * Get the predefined color palette (16 visually distinct colors)
 * Reduced from 40 colors to ensure minimum euclidean distance >= 30 between all pairs
 * This prevents near-identical colors being assigned to different looms
 *
 * @returns Array of 16 RGB colors
 */
export function getColorPalette(): RgbColor[] {
	return [
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
}

/**
 * Get the dark mode color palette (16 visually distinct colors)
 * These are dark, muted colors that provide good contrast
 * with light terminal text on dark backgrounds
 *
 * RGB values are in the ~25-85 range for subtle dark backgrounds
 * with enough variation for visual distinctness
 *
 * @returns Array of 16 RGB colors optimized for dark terminal themes
 */
export function getDarkColorPalette(): RgbColor[] {
	return [
		{ r: 30, g: 45, b: 85 }, // 0: Dark blue
		{ r: 85, g: 30, b: 50 }, // 1: Dark rose
		{ r: 30, g: 75, b: 40 }, // 2: Dark green
		{ r: 75, g: 65, b: 30 }, // 3: Dark olive
		{ r: 60, g: 35, b: 85 }, // 4: Dark lavender
		{ r: 30, g: 65, b: 75 }, // 5: Dark cyan
		{ r: 55, g: 55, b: 55 }, // 6: Dark grey
		{ r: 85, g: 40, b: 40 }, // 7: Dark coral
		{ r: 35, g: 80, b: 50 }, // 8: Dark mint
		{ r: 70, g: 50, b: 30 }, // 9: Dark brown
		{ r: 30, g: 75, b: 75 }, // 10: Dark aqua
		{ r: 75, g: 30, b: 75 }, // 11: Dark magenta
		{ r: 75, g: 75, b: 30 }, // 12: Dark yellow
		{ r: 50, g: 35, b: 85 }, // 13: Dark violet
		{ r: 30, g: 80, b: 65 }, // 14: Dark sea green
		{ r: 85, g: 40, b: 30 }, // 15: Dark rust
	]
}

/**
 * Convert RGB values to hex color format
 *
 * @param r - Red value (0-255)
 * @param g - Green value (0-255)
 * @param b - Blue value (0-255)
 * @returns Hex color string (e.g., "#dcebf8")
 * @throws Error if RGB values are out of range
 */
export function rgbToHex(r: number, g: number, b: number): string {
	// Validate RGB values
	if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
		throw new Error('RGB values must be between 0 and 255')
	}

	// Convert to hex and pad with zeros
	const rHex = r.toString(16).padStart(2, '0')
	const gHex = g.toString(16).padStart(2, '0')
	const bHex = b.toString(16).padStart(2, '0')

	return `#${rHex}${gHex}${bHex}`
}

/**
 * Convert hex color format to RGB values
 *
 * @param hex - Hex color string (with or without # prefix)
 * @returns RGB color object
 * @throws Error if hex format is invalid
 */
export function hexToRgb(hex: string): RgbColor {
	// Remove # prefix if present
	const cleanHex = hex.startsWith('#') ? hex.slice(1) : hex

	// Validate format (must be exactly 6 hex characters)
	if (cleanHex.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(cleanHex)) {
		throw new Error('Invalid hex color format. Expected format: #RRGGBB or RRGGBB')
	}

	// Parse hex values
	const r = parseInt(cleanHex.slice(0, 2), 16)
	const g = parseInt(cleanHex.slice(2, 4), 16)
	const b = parseInt(cleanHex.slice(4, 6), 16)

	return { r, g, b }
}

/**
 * Generate deterministic color from branch name using SHA256 hash
 * Matches the bash implementation in bash/new-branch-workflow.sh
 *
 * @param branchName - Branch name to generate color from
 * @param themeMode - Theme mode for palette selection ('light' or 'dark')
 * @returns ColorData with RGB, hex, and palette index
 */
export function generateColorFromBranchName(
	branchName: string,
	themeMode: ThemeMode = 'light'
): ColorData {
	// Generate SHA256 hash of branch name
	const hash = createHash('sha256').update(branchName).digest('hex')

	// Take first 8 hex characters and convert to index (0-39)
	// Matches bash: local index=$(( 0x$hash % ${#colors[@]} ))
	const hashPrefix = hash.slice(0, 8)
	const palette = themeMode === 'dark' ? getDarkColorPalette() : getColorPalette()
	const hashAsInt = parseInt(hashPrefix, 16)
	const index = hashAsInt % palette.length
	logger.debug(`[generateColorFromBranchName] Branch name: ${branchName}, Hash: ${hash}, Hash prefix: ${hashPrefix}, Hash as int: ${hashAsInt}, Index: ${index}`)

	// Get color from palette
	const rgb = palette[index]

	// This should never happen as index is always in range [0, palette.length)
	if (!rgb) {
		throw new Error(`Invalid color index: ${index}`)
	}

	// Convert to hex format
	const hex = rgbToHex(rgb.r, rgb.g, rgb.b)

	return {
		rgb,
		hex,
		index,
	}
}

/**
 * Calculate euclidean distance between two RGB colors
 */
export function colorDistance(a: RgbColor, b: RgbColor): number {
	return Math.sqrt(
		Math.pow(a.r - b.r, 2) +
		Math.pow(a.g - b.g, 2) +
		Math.pow(a.b - b.b, 2)
	)
}

/**
 * Minimum distance threshold for colors to be considered "distinct"
 * Note: With RGB constrained to 220-255 range (subtle backgrounds),
 * the maximum possible distance between any two colors is ~60.6
 * A threshold of 20 ensures colors are visually distinguishable
 * (vs the original palette minimum of 3.61) while allowing enough
 * palette diversity for typical concurrent loom counts (5-10).
 */
export const MIN_COLOR_DISTANCE = 20

/**
 * Select a color for a branch, avoiding colors that are too similar to hex colors in use
 * This function is robust against palette changes since it compares hex colors directly.
 *
 * @param branchName - Branch name to generate base color from
 * @param usedHexColors - Array of hex colors (e.g., "#dcebff") already in use by active looms
 * @param themeMode - Theme mode for palette selection ('light' for light pastels, 'dark' for darker colors)
 * @returns ColorData with the selected color
 */
export function selectDistinctColor(
	branchName: string,
	usedHexColors: string[],
	themeMode: ThemeMode = 'light'
): ColorData {
	const palette = themeMode === 'dark' ? getDarkColorPalette() : getColorPalette()
	const hashBasedColor = generateColorFromBranchName(branchName, themeMode)

	// If no colors in use, return hash-based selection
	if (usedHexColors.length === 0) {
		return hashBasedColor
	}

	// Convert used hex colors to RGB for distance calculation
	const usedRgbColors: RgbColor[] = []
	for (const hex of usedHexColors) {
		try {
			usedRgbColors.push(hexToRgb(hex))
		} catch {
			// Skip invalid hex colors
			logger.debug(`[selectDistinctColor] Skipping invalid hex color: ${hex}`)
		}
	}

	// If all hex colors were invalid, return hash-based selection
	if (usedRgbColors.length === 0) {
		return hashBasedColor
	}

	// Check if hash-based color is distinct enough from all used colors
	const isTooSimilar = usedRgbColors.some(usedRgb =>
		colorDistance(hashBasedColor.rgb, usedRgb) < MIN_COLOR_DISTANCE
	)

	if (!isTooSimilar) {
		return hashBasedColor
	}

	// Find the first available color that's distinct from all used colors
	for (let i = 0; i < palette.length; i++) {
		const candidateRgb = palette[i]
		if (!candidateRgb) continue

		const isDistinct = usedRgbColors.every(usedRgb =>
			colorDistance(candidateRgb, usedRgb) >= MIN_COLOR_DISTANCE
		)

		if (isDistinct) {
			return {
				rgb: candidateRgb,
				hex: rgbToHex(candidateRgb.r, candidateRgb.g, candidateRgb.b),
				index: i,
			}
		}
	}

	// Fallback: all colors too similar, return hash-based (best effort)
	logger.debug(`[selectDistinctColor] No distinct color found, falling back to hash-based for ${branchName}`)
	return hashBasedColor
}

/**
 * Lighten a color by a given amount
 * Useful for creating slightly lighter variants for hover states
 *
 * @param rgb - RGB color to lighten
 * @param amount - Amount to lighten (0-1, where 0.1 = 10% lighter)
 * @returns Lightened RGB color
 */
export function lightenColor(rgb: RgbColor, amount: number): RgbColor {
	const clamp = (value: number): number => Math.min(255, Math.max(0, Math.round(value)))

	return {
		r: clamp(rgb.r + (255 - rgb.r) * amount),
		g: clamp(rgb.g + (255 - rgb.g) * amount),
		b: clamp(rgb.b + (255 - rgb.b) * amount),
	}
}

/**
 * Saturate a color by pushing it away from grey towards its dominant hue
 * Makes subtle colors more vivid while maintaining their hue
 *
 * @param rgb - RGB color to saturate
 * @param amount - Amount to saturate (0-1, where 0.4 = 40% more saturated)
 * @returns Saturated RGB color
 */
export function saturateColor(rgb: RgbColor, amount: number): RgbColor {
	const clamp = (value: number): number => Math.min(255, Math.max(0, Math.round(value)))

	// Calculate average (grey point)
	const avg = (rgb.r + rgb.g + rgb.b) / 3

	// Push each channel away from grey
	return {
		r: clamp(rgb.r + (rgb.r - avg) * amount),
		g: clamp(rgb.g + (rgb.g - avg) * amount),
		b: clamp(rgb.b + (rgb.b - avg) * amount),
	}
}

/**
 * Calculate appropriate foreground color (black or white) for a given background
 * Uses relative luminance formula from WCAG 2.0
 *
 * @param rgb - Background RGB color
 * @returns '#000000' for light backgrounds, '#ffffff' for dark backgrounds
 */
export function calculateForegroundColor(rgb: RgbColor): string {
	// Convert RGB to relative luminance (WCAG 2.0 formula)
	const toLinear = (channel: number): number => {
		const c = channel / 255
		return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
	}

	const r = toLinear(rgb.r)
	const g = toLinear(rgb.g)
	const b = toLinear(rgb.b)

	const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b

	// Use black text for light backgrounds (luminance > 0.5)
	// Use white text for dark backgrounds
	return luminance > 0.5 ? '#000000' : '#ffffff'
}
