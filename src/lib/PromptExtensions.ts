import { readFile } from 'fs/promises'
import path from 'path'
import { logger } from '../utils/logger.js'
import { TelemetryService } from './TelemetryService.js'

/**
 * Result of loading repository-local prompt extensions.
 *
 * Shared contract consumed by commands/services that inject per-repo
 * customization (e.g. ILOOM.md) into agent prompt templates.
 */
export interface PromptExtensions {
	/**
	 * Contents of the repository's `ILOOM.md` file, trimmed of trailing
	 * whitespace. Empty string when the file is absent or unreadable.
	 */
	iloomMd: string
}

/**
 * Module-level flag ensuring the `iloom_md.loaded` telemetry event fires at
 * most once per process, regardless of how many times `loadPromptExtensions`
 * is invoked.
 */
let telemetryFired = false

/**
 * Test-only hook to reset the module-level telemetry flag. Not part of the
 * public API.
 *
 * @internal
 */
export function __resetTelemetryFiredForTests(): void {
	telemetryFired = false
}

function computeSizeBucket(byteLength: number): 'empty' | 'small' | 'medium' | 'large' {
	if (byteLength === 0) return 'empty'
	if (byteLength < 1024) return 'small'
	if (byteLength < 10240) return 'medium'
	return 'large'
}

function fireTelemetryOnce(present: boolean, rawContent: string): void {
	if (telemetryFired) return
	telemetryFired = true
	try {
		const byteLength = Buffer.byteLength(rawContent, 'utf-8')
		const size_bucket = computeSizeBucket(byteLength)
		TelemetryService.getInstance().track('iloom_md.loaded', {
			present,
			size_bucket,
		})
	} catch (error) {
		logger.debug(`PromptExtensions: telemetry error: ${String(error)}`)
	}
}

/**
 * Load per-repository prompt extensions from the given `repoRoot`.
 *
 * Currently reads `${repoRoot}/ILOOM.md`. This function follows the
 * graceful-degradation shape of `loadReadmeContent()` in `src/commands/ignite.ts`
 * but takes an explicit repo root rather than walking up the filesystem.
 *
 * Contract:
 * - On successful read: returns `{ iloomMd: <content trimmed of trailing whitespace> }`.
 * - On ENOENT: returns `{ iloomMd: "" }` and debug-logs.
 * - On any other read error: returns `{ iloomMd: "" }` and debug-logs.
 * - Never throws.
 *
 * Fires a single `iloom_md.loaded` telemetry event per process the first time
 * the loader runs, regardless of outcome. Telemetry is fire-and-forget and
 * wrapped in try/catch; it never breaks the workflow.
 *
 * @param repoRoot Absolute path to the repository root directory.
 * @returns A `PromptExtensions` object; `iloomMd` is an empty string when the
 *   file is absent or unreadable.
 */
export async function loadPromptExtensions(repoRoot: string): Promise<PromptExtensions> {
	const iloomMdPath = path.join(repoRoot, 'ILOOM.md')
	let rawContent = ''
	let present = false

	try {
		rawContent = await readFile(iloomMdPath, 'utf-8')
		present = true
		logger.debug('PromptExtensions: loaded ILOOM.md', { iloomMdPath })
	} catch (error) {
		// Check for ENOENT explicitly so the common "missing file" case is
		// logged as routine. Any other read error (permissions, IO, etc.) is
		// still handled by the public contract — return empty and debug-log.
		const code = (error as NodeJS.ErrnoException | undefined)?.code
		if (code === 'ENOENT') {
			logger.debug('PromptExtensions: ILOOM.md not found', { iloomMdPath })
		} else {
			logger.debug(`PromptExtensions: failed to read ILOOM.md: ${String(error)}`, {
				iloomMdPath,
				code,
			})
		}
	}

	fireTelemetryOnce(present, rawContent)

	return {
		iloomMd: present ? rawContent.replace(/\s+$/, '') : '',
	}
}
