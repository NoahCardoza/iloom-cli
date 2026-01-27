import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ClaudeHookManager } from './ClaudeHookManager.js'
import path from 'path'
import os from 'os'
import fs from 'fs-extra'

// Mock fs-extra
vi.mock('fs-extra', () => ({
	default: {
		ensureDir: vi.fn(),
		pathExists: vi.fn(),
		readFile: vi.fn(),
		writeFile: vi.fn(),
		rename: vi.fn(),
		copyFile: vi.fn(),
	},
}))

// Mock os
vi.mock('os', () => ({
	default: {
		homedir: vi.fn(() => '/mock/home'),
	},
}))

// Mock logger
vi.mock('../utils/logger.js', () => ({
	logger: {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
		success: vi.fn(),
	},
}))

// Mock fs.accessSync used in constructor for template discovery
vi.mock('fs', async () => {
	const actual = await vi.importActual('fs')
	return {
		...actual,
		accessSync: vi.fn(() => {
			// Simulate template directory exists
		}),
	}
})

describe('ClaudeHookManager', () => {
	let hookManager: ClaudeHookManager
	const mockHome = '/mock/home'
	const mockClaudeDir = path.join(mockHome, '.claude')
	const mockHooksDir = path.join(mockClaudeDir, 'hooks')
	const mockSettingsPath = path.join(mockClaudeDir, 'settings.json')

	beforeEach(() => {
		vi.mocked(os.homedir).mockReturnValue(mockHome)
		hookManager = new ClaudeHookManager()
	})

	describe('installHooks', () => {
		it('should create ~/.claude/hooks directory if missing', async () => {
			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.copyFile).mockResolvedValue(undefined)
			vi.mocked(fs.readFile).mockResolvedValue('{}')
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await hookManager.installHooks()

			expect(fs.ensureDir).toHaveBeenCalledWith(mockHooksDir)
		})

		it('should copy hook script to correct location', async () => {
			vi.mocked(fs.pathExists).mockImplementation(async (p) => {
				// Template exists, destination hook doesn't (so it needs to be copied)
				if (p.toString().includes(mockHooksDir)) {
					return false
				}
				return true
			})
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.copyFile).mockResolvedValue(undefined)
			vi.mocked(fs.readFile).mockResolvedValue('{}')
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await hookManager.installHooks()

			expect(fs.copyFile).toHaveBeenCalledWith(
				expect.stringContaining('iloom-hook.js'),
				path.join(mockHooksDir, 'iloom-hook.js')
			)
		})

		it('should merge hook config into empty settings.json', async () => {
			vi.mocked(fs.pathExists).mockImplementation(async (p) => {
				// Template exists, settings doesn't
				return p.toString().includes('iloom-hook.js')
			})
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.copyFile).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await hookManager.installHooks()

			// Verify settings were written with hooks
			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			expect(writeCall).toBeDefined()
			const content = writeCall[1] as string
			const settings = JSON.parse(content)

			expect(settings.hooks).toBeDefined()
			expect(settings.hooks.SessionStart).toBeDefined()
			expect(settings.hooks.SessionEnd).toBeDefined()
			expect(settings.hooks.PermissionRequest).toBeDefined()
			expect(settings.hooks.Notification).toBeDefined()
			expect(settings.hooks.Stop).toBeDefined()
			expect(settings.hooks.SubagentStop).toBeDefined()

			// SessionStart should have matcher: '*' for receiving all sources (including 'clear')
			expect(settings.hooks.SessionStart[0].matcher).toBe('*')
		})

		it('should merge hook config preserving existing user hooks', async () => {
			const existingSettings = {
				hooks: {
					CustomEvent: [{ hooks: [{ type: 'command', command: 'custom-script.sh' }] }]
				},
				otherSetting: 'value'
			}

			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.copyFile).mockResolvedValue(undefined)
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingSettings))
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await hookManager.installHooks()

			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			const content = writeCall[1] as string
			const settings = JSON.parse(content)

			// Existing hooks preserved
			expect(settings.hooks.CustomEvent).toEqual([
				{ hooks: [{ type: 'command', command: 'custom-script.sh' }] }
			])
			// Other settings preserved
			expect(settings.otherSetting).toBe('value')
			// Our hooks added
			expect(settings.hooks.SessionStart).toBeDefined()
		})

		it('should preserve comments in JSONC settings.json', async () => {
			const jsoncContent = `{
  // User settings
  "hooks": {},
  /* Important config */
  "other": "value"
}`

			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.copyFile).mockResolvedValue(undefined)
			vi.mocked(fs.readFile).mockResolvedValue(jsoncContent)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await hookManager.installHooks()

			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			const content = writeCall[1] as string

			// Comments should be preserved
			expect(content).toContain('// User settings')
			expect(content).toContain('/* Important config */')
		})

		it('should handle missing ~/.claude directory', async () => {
			vi.mocked(fs.pathExists).mockImplementation(async (p) => {
				// Only template exists
				return p.toString().includes('iloom-hook.js')
			})
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.copyFile).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await hookManager.installHooks()

			// Should create claude directory
			expect(fs.ensureDir).toHaveBeenCalledWith(mockHooksDir)
			expect(fs.ensureDir).toHaveBeenCalledWith(mockClaudeDir)
		})

		it('should be idempotent - safe to run multiple times', async () => {
			// Settings already have ALL our hooks with correct matchers
			const existingSettings = {
				hooks: {
					SessionStart: [
						{ matcher: '*', hooks: [{ type: 'command', command: `node ${mockHooksDir}/iloom-hook.js` }] }
					],
					SessionEnd: [
						{ hooks: [{ type: 'command', command: `node ${mockHooksDir}/iloom-hook.js` }] }
					],
					Notification: [
						{ hooks: [{ type: 'command', command: `node ${mockHooksDir}/iloom-hook.js` }] }
					],
					Stop: [
						{ hooks: [{ type: 'command', command: `node ${mockHooksDir}/iloom-hook.js` }] }
					],
					SubagentStop: [
						{ hooks: [{ type: 'command', command: `node ${mockHooksDir}/iloom-hook.js` }] }
					],
					PermissionRequest: [
						{ matcher: '*', hooks: [{ type: 'command', command: `node ${mockHooksDir}/iloom-hook.js`, timeout: 86400 }] }
					],
					PreToolUse: [
						{ matcher: '*', hooks: [{ type: 'command', command: `node ${mockHooksDir}/iloom-hook.js` }] }
					],
					PostToolUse: [
						{ matcher: '*', hooks: [{ type: 'command', command: `node ${mockHooksDir}/iloom-hook.js` }] }
					],
					UserPromptSubmit: [
						{ hooks: [{ type: 'command', command: `node ${mockHooksDir}/iloom-hook.js` }] }
					]
				}
			}

			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.copyFile).mockResolvedValue(undefined)
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingSettings))
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await hookManager.installHooks()

			// Should not write since nothing changed
			expect(fs.writeFile).not.toHaveBeenCalled()
		})

		it('should update existing hooks to add missing matcher property', async () => {
			// Settings have our hooks but WITHOUT the matcher
			const existingSettings = {
				hooks: {
					SessionStart: [
						{ hooks: [{ type: 'command', command: `node ${mockHooksDir}/iloom-hook.js` }] }
					]
				}
			}

			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.copyFile).mockResolvedValue(undefined)
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingSettings))
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await hookManager.installHooks()

			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			const content = writeCall[1] as string
			const settings = JSON.parse(content)

			// SessionStart should now have the matcher property
			expect(settings.hooks.SessionStart).toHaveLength(1)
			expect(settings.hooks.SessionStart[0].matcher).toBe('*')
		})

		it('should not throw on errors - logs warning instead', async () => {
			vi.mocked(fs.ensureDir).mockRejectedValue(new Error('Permission denied'))

			// Should not throw
			await expect(hookManager.installHooks()).resolves.not.toThrow()
		})

		it('should skip copying hook script when content is identical', async () => {
			const hookContent = '// iloom hook script content'

			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			// Return identical content for both source and destination
			vi.mocked(fs.readFile).mockImplementation(async (p) => {
				if (p.toString().includes('iloom-hook.js')) {
					return hookContent
				}
				return '{}'
			})
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await hookManager.installHooks()

			// copyFile should NOT be called since content matches
			expect(fs.copyFile).not.toHaveBeenCalled()
		})

		it('should copy hook script when content differs', async () => {
			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			// Return different content for source vs destination
			vi.mocked(fs.readFile).mockImplementation(async (p) => {
				if (p.toString().includes('iloom-hook.js')) {
					// Destination path is in hooksDir, source is in templateDir
					if (p.toString().includes(mockHooksDir)) {
						return '// old hook content'
					}
					return '// new hook content'
				}
				return '{}'
			})
			vi.mocked(fs.copyFile).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await hookManager.installHooks()

			// copyFile should be called since content differs
			expect(fs.copyFile).toHaveBeenCalledWith(
				expect.stringContaining('iloom-hook.js'),
				path.join(mockHooksDir, 'iloom-hook.js')
			)
		})
	})

	describe('isHooksInstalled', () => {
		it('should return false when hook script missing', async () => {
			vi.mocked(fs.pathExists).mockImplementation(async (p) => {
				// Settings exists, hook script doesn't
				return p.toString().includes('settings.json')
			})

			const result = await hookManager.isHooksInstalled()

			expect(result).toBe(false)
		})

		it('should return false when settings.json missing hooks', async () => {
			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue('{}')

			const result = await hookManager.isHooksInstalled()

			expect(result).toBe(false)
		})

		it('should return true when both hook script and settings are installed', async () => {
			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
				hooks: {
					SessionStart: [{ hooks: [{ type: 'command', command: 'node test' }] }]
				}
			}))

			const result = await hookManager.isHooksInstalled()

			expect(result).toBe(true)
		})
	})

	describe('hook configuration', () => {
		it('should register hooks for all required events', async () => {
			vi.mocked(fs.pathExists).mockImplementation(async (p) => {
				return p.toString().includes('iloom-hook.js')
			})
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.copyFile).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await hookManager.installHooks()

			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			const content = writeCall[1] as string
			const settings = JSON.parse(content)

			const requiredEvents = [
				'Notification',
				'Stop',
				'SubagentStop',
				'PermissionRequest',
				'SessionStart',
				'SessionEnd',
				'UserPromptSubmit'
			]

			for (const event of requiredEvents) {
				expect(settings.hooks[event]).toBeDefined()
				expect(settings.hooks[event]).toHaveLength(1)
			}
		})

		it('should register UserPromptSubmit hook for subagent delegation reminders', async () => {
			vi.mocked(fs.pathExists).mockImplementation(async (p) => {
				return p.toString().includes('iloom-hook.js')
			})
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.copyFile).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await hookManager.installHooks()

			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			const content = writeCall[1] as string
			const settings = JSON.parse(content)

			// UserPromptSubmit hook should be registered
			expect(settings.hooks.UserPromptSubmit).toBeDefined()
			expect(settings.hooks.UserPromptSubmit).toHaveLength(1)
			expect(settings.hooks.UserPromptSubmit[0].hooks[0].type).toBe('command')
			expect(settings.hooks.UserPromptSubmit[0].hooks[0].command).toContain('iloom-hook.js')
		})

		it('should set PermissionRequest with matcher and timeout', async () => {
			vi.mocked(fs.pathExists).mockImplementation(async (p) => {
				return p.toString().includes('iloom-hook.js')
			})
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.copyFile).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await hookManager.installHooks()

			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			const content = writeCall[1] as string
			const settings = JSON.parse(content)

			const permissionRequest = settings.hooks.PermissionRequest[0]
			expect(permissionRequest.matcher).toBe('*')
			expect(permissionRequest.hooks[0].timeout).toBe(86400)
		})

		it('should use correct hook command path', async () => {
			vi.mocked(fs.pathExists).mockImplementation(async (p) => {
				return p.toString().includes('iloom-hook.js')
			})
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.copyFile).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await hookManager.installHooks()

			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			const content = writeCall[1] as string
			const settings = JSON.parse(content)

			const hookCommand = settings.hooks.SessionStart[0].hooks[0].command
			expect(hookCommand).toBe(`node ${mockHooksDir}/iloom-hook.js`)
		})
	})

	describe('atomic file writes', () => {
		it('should write to temp file and rename for atomic update', async () => {
			vi.mocked(fs.pathExists).mockImplementation(async (p) => {
				return p.toString().includes('iloom-hook.js')
			})
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.copyFile).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await hookManager.installHooks()

			// Should write to temp file first
			expect(fs.writeFile).toHaveBeenCalledWith(
				expect.stringMatching(/settings\.json\.tmp$/),
				expect.any(String),
				'utf8'
			)

			// Should rename temp to final
			expect(fs.rename).toHaveBeenCalledWith(
				expect.stringMatching(/settings\.json\.tmp$/),
				mockSettingsPath
			)
		})
	})
})
