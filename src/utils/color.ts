import { createHash } from 'crypto'

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
 * Get the predefined color palette (10 subtle, professional colors)
 * Matches the terminal color palette from bash/new-branch-workflow.sh
 *
 * @returns Array of 10 RGB colors
 */
export function getColorPalette(): RgbColor[] {
	return [
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
 * @returns ColorData with RGB, hex, and palette index
 */
export function generateColorFromBranchName(branchName: string): ColorData {
	// Generate SHA256 hash of branch name
	const hash = createHash('sha256').update(branchName).digest('hex')

	// Take first 8 hex characters and convert to index (0-9)
	// Matches bash: local index=$(( 0x$hash % ${#colors[@]} ))
	const hashPrefix = hash.slice(0, 8)
	const palette = getColorPalette()
	const index = parseInt(hashPrefix, 16) % palette.length

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
