/**
 * Capitalizes the first letter of a string.
 *
 * Override behavior: If the string starts with a space, it signals the user
 * wants to opt-out of auto-capitalization. In this case, the leading space
 * is stripped and the first letter is NOT capitalized.
 *
 * @param str - The string to process
 * @returns The processed string with first letter capitalized (or original if override)
 */
export function capitalizeFirstLetter(str: string): string {
	// Handle empty or whitespace-only strings
	if (!str || str.length === 0) {
		return str
	}

	// Check for space-prefix override: strip leading space and return as-is
	if (str.startsWith(' ')) {
		return str.slice(1)
	}

	// Find the first character that could be capitalized (a letter)
	const firstChar = str.charAt(0)

	// If first character is a letter (including unicode), capitalize it
	// Check if toUpperCase() produces a different result (indicates it's a letter with case)
	const upperChar = firstChar.toUpperCase()
	if (upperChar !== firstChar.toLowerCase() || /\p{L}/u.test(firstChar)) {
		// Only capitalize if it actually changes (avoids issues with non-cased scripts)
		if (upperChar !== firstChar) {
			return upperChar + str.slice(1)
		}
	}

	// Non-letter first character or no case transformation available: return unchanged
	return str
}
