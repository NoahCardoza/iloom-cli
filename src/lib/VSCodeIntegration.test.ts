import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { VSCodeIntegration } from './VSCodeIntegration.js'
import path from 'path'
import fs from 'fs-extra'

// Mock fs-extra
vi.mock('fs-extra', () => ({
	default: {
		ensureDir: vi.fn(),
		pathExists: vi.fn(),
		readFile: vi.fn(),
		writeFile: vi.fn(),
		rename: vi.fn(),
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

describe('VSCodeIntegration', () => {
	let vscode: VSCodeIntegration
	const testWorkspacePath = '/test/workspace'
	const testVscodeDir = path.join(testWorkspacePath, '.vscode')
	const testSettingsPath = path.join(testVscodeDir, 'settings.json')

	beforeEach(() => {
		vscode = new VSCodeIntegration()
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe('setTitleBarColor', () => {
		it('should create .vscode directory if it does not exist', async () => {
			vi.mocked(fs.pathExists).mockResolvedValue(false)
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await vscode.setTitleBarColor(testWorkspacePath, '#dcebf8')

			expect(fs.ensureDir).toHaveBeenCalledWith(testVscodeDir)
		})

		it('should create new settings.json with color when file does not exist', async () => {
			vi.mocked(fs.pathExists).mockResolvedValue(false)
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await vscode.setTitleBarColor(testWorkspacePath, '#dcebf8')

			// Check that writeFile was called with correct data
			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			const content = writeCall[1] as string
			const settings = JSON.parse(content)

			expect(settings).toEqual({
				'workbench.colorCustomizations': {
					'titleBar.activeBackground': '#dcebf8',
					'titleBar.activeForeground': '#000000',
				},
			})
		})

		it('should merge color into existing settings.json', async () => {
			const existingSettings = {
				'editor.fontSize': 14,
				'editor.tabSize': 2,
			}

			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingSettings, null, 2))
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await vscode.setTitleBarColor(testWorkspacePath, '#f8dceb')

			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			const content = writeCall[1] as string
			const settings = JSON.parse(content)

			expect(settings).toEqual({
				'editor.fontSize': 14,
				'editor.tabSize': 2,
				'workbench.colorCustomizations': {
					'titleBar.activeBackground': '#f8dceb',
					'titleBar.activeForeground': '#000000',
				},
			})
		})

		it('should preserve existing workbench.colorCustomizations settings', async () => {
			const existingSettings = {
				'workbench.colorCustomizations': {
					'statusBar.background': '#ff0000',
					'activityBar.background': '#00ff00',
				},
			}

			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingSettings, null, 2))
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await vscode.setTitleBarColor(testWorkspacePath, '#dcf8eb')

			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			const content = writeCall[1] as string
			const settings = JSON.parse(content)

			expect(settings).toEqual({
				'workbench.colorCustomizations': {
					'statusBar.background': '#ff0000',
					'activityBar.background': '#00ff00',
					'titleBar.activeBackground': '#dcf8eb',
					'titleBar.activeForeground': '#000000',
				},
			})
		})

		it('should preserve other settings keys unrelated to colors', async () => {
			const existingSettings = {
				'editor.fontSize': 14,
				'files.autoSave': 'onFocusChange',
				'terminal.integrated.fontSize': 12,
				'workbench.colorCustomizations': {
					'statusBar.background': '#ff0000',
				},
			}

			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingSettings, null, 2))
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await vscode.setTitleBarColor(testWorkspacePath, '#f8f0dc')

			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			const content = writeCall[1] as string
			const settings = JSON.parse(content)

			expect(settings).toMatchObject({
				'editor.fontSize': 14,
				'files.autoSave': 'onFocusChange',
				'terminal.integrated.fontSize': 12,
			})
		})

		it('should handle JSONC files with comments (preserving comments)', async () => {
			const jsoncContent = `{
  // Editor settings
  "editor.fontSize": 14,
  /* Multi-line
     comment */
  "editor.tabSize": 2
}`

			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(jsoncContent)
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await vscode.setTitleBarColor(testWorkspacePath, '#dcebf8')

			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			const content = writeCall[1] as string

			// Comments should be preserved
			expect(content).toContain('// Editor settings')
			expect(content).toContain('/* Multi-line')

			// Settings should be valid
			const { parse } = await import('jsonc-parser')
			const settings = parse(content)
			expect(settings['workbench.colorCustomizations']['titleBar.activeBackground']).toBe(
				'#dcebf8'
			)
		})

		it('should overwrite existing titleBar colors', async () => {
			const existingSettings = {
				'workbench.colorCustomizations': {
					'titleBar.activeBackground': '#ff0000',
					'titleBar.activeForeground': '#ffffff',
				},
			}

			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingSettings, null, 2))
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await vscode.setTitleBarColor(testWorkspacePath, '#dcebf8')

			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			const content = writeCall[1] as string
			const settings = JSON.parse(content)

			expect(settings['workbench.colorCustomizations']['titleBar.activeBackground']).toBe(
				'#dcebf8'
			)
			expect(settings['workbench.colorCustomizations']['titleBar.activeForeground']).toBe(
				'#000000'
			)
		})

		it('should handle malformed JSON gracefully with descriptive error', async () => {
			const malformedJson = '{ "editor.fontSize": 14, invalid }'

			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(malformedJson)
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)

			await expect(vscode.setTitleBarColor(testWorkspacePath, '#dcebf8')).rejects.toThrow(
				/Failed to parse settings\.json/
			)
		})

		it('should write atomically using temp file and rename', async () => {
			vi.mocked(fs.pathExists).mockResolvedValue(false)
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await vscode.setTitleBarColor(testWorkspacePath, '#dcebf8')

			// Should write to temp file first
			expect(fs.writeFile).toHaveBeenCalledWith(
				expect.stringMatching(/settings\.json\.tmp$/),
				expect.any(String),
				'utf8'
			)

			// Should rename temp to final
			expect(fs.rename).toHaveBeenCalledWith(
				expect.stringMatching(/settings\.json\.tmp$/),
				testSettingsPath
			)
		})

		it('should format JSON with 2-space indentation', async () => {
			vi.mocked(fs.pathExists).mockResolvedValue(false)
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await vscode.setTitleBarColor(testWorkspacePath, '#dcebf8')

			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			const content = writeCall[1] as string

			// Check indentation
			expect(content).toContain('  "workbench.colorCustomizations"')
			expect(content).toContain('    "titleBar.activeBackground"')
		})
	})

	describe('resetTitleBarColor', () => {
		it('should remove titleBar color settings', async () => {
			const existingSettings = {
				'workbench.colorCustomizations': {
					'titleBar.activeBackground': '#dcebf8',
					'titleBar.activeForeground': '#000000',
					'statusBar.background': '#ff0000',
				},
			}

			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingSettings, null, 2))
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await vscode.resetTitleBarColor(testWorkspacePath)

			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			const content = writeCall[1] as string
			const settings = JSON.parse(content)

			expect(settings['workbench.colorCustomizations']).toEqual({
				'statusBar.background': '#ff0000',
			})
			expect(settings['workbench.colorCustomizations']['titleBar.activeBackground']).toBeUndefined()
			expect(settings['workbench.colorCustomizations']['titleBar.activeForeground']).toBeUndefined()
		})

		it('should remove empty workbench.colorCustomizations object', async () => {
			const existingSettings = {
				'editor.fontSize': 14,
				'workbench.colorCustomizations': {
					'titleBar.activeBackground': '#dcebf8',
					'titleBar.activeForeground': '#000000',
				},
			}

			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingSettings, null, 2))
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await vscode.resetTitleBarColor(testWorkspacePath)

			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			const content = writeCall[1] as string
			const settings = JSON.parse(content)

			expect(settings['workbench.colorCustomizations']).toBeUndefined()
			expect(settings).toEqual({
				'editor.fontSize': 14,
			})
		})

		it('should preserve other settings', async () => {
			const existingSettings = {
				'editor.fontSize': 14,
				'files.autoSave': 'onFocusChange',
				'workbench.colorCustomizations': {
					'titleBar.activeBackground': '#dcebf8',
					'titleBar.activeForeground': '#000000',
				},
			}

			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingSettings, null, 2))
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await vscode.resetTitleBarColor(testWorkspacePath)

			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			const content = writeCall[1] as string
			const settings = JSON.parse(content)

			expect(settings).toMatchObject({
				'editor.fontSize': 14,
				'files.autoSave': 'onFocusChange',
			})
		})

		it('should handle missing settings.json gracefully', async () => {
			vi.mocked(fs.pathExists).mockResolvedValue(false)

			// Should not throw - no settings to reset
			await expect(vscode.resetTitleBarColor(testWorkspacePath)).resolves.not.toThrow()
		})

		it('should handle settings.json without workbench.colorCustomizations', async () => {
			const existingSettings = {
				'editor.fontSize': 14,
			}

			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingSettings, null, 2))
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await expect(vscode.resetTitleBarColor(testWorkspacePath)).resolves.not.toThrow()

			// Should still write the file (no changes)
			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			const content = writeCall[1] as string
			const settings = JSON.parse(content)

			expect(settings).toEqual({
				'editor.fontSize': 14,
			})
		})
	})

	describe('error scenarios', () => {
		it('should throw meaningful error when ensureDir fails', async () => {
			vi.mocked(fs.ensureDir).mockRejectedValue(new Error('EACCES: permission denied'))

			await expect(vscode.setTitleBarColor(testWorkspacePath, '#dcebf8')).rejects.toThrow(
				/Failed to set VSCode title bar color/
			)
		})

		it('should handle file write permission errors', async () => {
			vi.mocked(fs.pathExists).mockResolvedValue(false)
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockRejectedValue(new Error('EACCES: permission denied'))

			await expect(vscode.setTitleBarColor(testWorkspacePath, '#dcebf8')).rejects.toThrow(
				/Failed to set VSCode title bar color/
			)
		})
	})

	describe('integration scenarios', () => {
		it('should handle complex real-world settings file', async () => {
			const complexSettings = {
				'editor.fontSize': 14,
				'editor.fontFamily': 'Fira Code',
				'editor.rulers': [80, 120],
				'files.exclude': {
					'**/.git': true,
					'**/node_modules': true,
				},
				'workbench.colorCustomizations': {
					'statusBar.background': '#1e1e1e',
					'activityBar.background': '#2d2d2d',
				},
				'[javascript]': {
					'editor.defaultFormatter': 'esbenp.prettier-vscode',
				},
			}

			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(complexSettings, null, 2))
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await vscode.setTitleBarColor(testWorkspacePath, '#dcebf8')

			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			const content = writeCall[1] as string
			const settings = JSON.parse(content)

			// All original settings preserved
			expect(settings['editor.fontSize']).toBe(14)
			expect(settings['editor.fontFamily']).toBe('Fira Code')
			expect(settings['editor.rulers']).toEqual([80, 120])
			expect(settings['files.exclude']).toEqual({
				'**/.git': true,
				'**/node_modules': true,
			})
			expect(settings['[javascript]']).toEqual({
				'editor.defaultFormatter': 'esbenp.prettier-vscode',
			})

			// Color customizations merged
			expect(settings['workbench.colorCustomizations']).toEqual({
				'statusBar.background': '#1e1e1e',
				'activityBar.background': '#2d2d2d',
				'titleBar.activeBackground': '#dcebf8',
				'titleBar.activeForeground': '#000000',
			})
		})

		it('should handle sequential color changes (simulating branch switches)', async () => {
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			// First color - file doesn't exist
			vi.mocked(fs.pathExists).mockResolvedValue(false)
			await vscode.setTitleBarColor(testWorkspacePath, '#dcebf8')
			let writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			let content = writeCall[1] as string
			let settings = JSON.parse(content)
			expect(settings['workbench.colorCustomizations']['titleBar.activeBackground']).toBe(
				'#dcebf8'
			)

			// Second color - file now exists with first color
			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(content)
			await vscode.setTitleBarColor(testWorkspacePath, '#f8dceb')
			writeCall = vi.mocked(fs.writeFile).mock.calls[1]
			content = writeCall[1] as string
			settings = JSON.parse(content)
			expect(settings['workbench.colorCustomizations']['titleBar.activeBackground']).toBe(
				'#f8dceb'
			)

			// Third color - file exists with second color
			vi.mocked(fs.readFile).mockResolvedValue(content)
			await vscode.setTitleBarColor(testWorkspacePath, '#dcf8eb')
			writeCall = vi.mocked(fs.writeFile).mock.calls[2]
			content = writeCall[1] as string
			settings = JSON.parse(content)
			expect(settings['workbench.colorCustomizations']['titleBar.activeBackground']).toBe(
				'#dcf8eb'
			)
		})
	})
})
