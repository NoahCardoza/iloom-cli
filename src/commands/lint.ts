import { ScriptCommandBase, ScriptCommandInput } from './script-command-base.js'

export type { ScriptCommandInput as LintCommandInput }

/**
 * LintCommand - Run the lint script for a workspace
 * Uses package.iloom.json if available, otherwise falls back to package.json
 */
export class LintCommand extends ScriptCommandBase {
	getScriptName(): string {
		return 'lint'
	}

	getScriptDisplayName(): string {
		return 'Lint'
	}
}
