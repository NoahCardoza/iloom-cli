import { ScriptCommandBase, ScriptCommandInput } from './script-command-base.js'

export type { ScriptCommandInput as BuildCommandInput }

/**
 * BuildCommand - Run the build script for a workspace
 * Uses package.iloom.json if available, otherwise falls back to package.json
 */
export class BuildCommand extends ScriptCommandBase {
	getScriptName(): string {
		return 'build'
	}

	getScriptDisplayName(): string {
		return 'Build'
	}
}
