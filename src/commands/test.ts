import { ScriptCommandBase, ScriptCommandInput } from './script-command-base.js'

export type { ScriptCommandInput as TestCommandInput }

/**
 * TestCommand - Run the test script for a workspace
 * Uses package.iloom.json if available, otherwise falls back to package.json
 */
export class TestCommand extends ScriptCommandBase {
	getScriptName(): string {
		return 'test'
	}

	getScriptDisplayName(): string {
		return 'Test'
	}
}
