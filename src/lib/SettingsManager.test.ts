import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SettingsManager } from './SettingsManager.js'
import { readFile } from 'fs/promises'

// Mock fs/promises
vi.mock('fs/promises')
vi.mock('../utils/logger.js', () => ({
	logger: {
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}))

describe('SettingsManager', () => {
	let settingsManager: SettingsManager

	beforeEach(() => {
		settingsManager = new SettingsManager()
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe('loadSettings', () => {
		it('should load and parse valid settings.json file', async () => {
			const projectRoot = '/test/project'
			const validSettings = {
				agents: {
					'hatchbox-issue-analyzer': {
						model: 'sonnet',
					},
					'hatchbox-issue-planner': {
						model: 'opus',
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(validSettings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result).toEqual(validSettings)
		})

		it('should return empty object when settings file does not exist', async () => {
			const projectRoot = '/test/project'
			const error: { code?: string; message: string } = {
				code: 'ENOENT',
				message: 'ENOENT: no such file or directory',
			}
			vi.mocked(readFile).mockRejectedValueOnce(error)

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result).toEqual({})
		})

		it('should return empty object when .hatchbox directory does not exist', async () => {
			const projectRoot = '/test/project'
			const error: { code?: string; message: string } = {
				code: 'ENOENT',
				message: 'ENOENT: no such file or directory',
			}
			vi.mocked(readFile).mockRejectedValueOnce(error)

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result).toEqual({})
		})

		it('should throw error for malformed JSON in settings file', async () => {
			const projectRoot = '/test/project'

			vi.mocked(readFile).mockResolvedValueOnce('invalid json {')

			await expect(settingsManager.loadSettings(projectRoot)).rejects.toThrow(
				/Failed to parse settings file/,
			)
		})

		it('should throw error for invalid settings structure (not an object)', async () => {
			const projectRoot = '/test/project'

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify('not an object'))

			await expect(settingsManager.loadSettings(projectRoot)).rejects.toThrow(
				/Settings file must be a JSON object/,
			)
		})

		it('should handle settings file with empty agents object', async () => {
			const projectRoot = '/test/project'
			const emptyAgentsSettings = {
				agents: {},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(emptyAgentsSettings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result).toEqual(emptyAgentsSettings)
		})

		it('should handle settings file with null agents value', async () => {
			const projectRoot = '/test/project'
			const nullAgentsSettings = {
				agents: null,
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(nullAgentsSettings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result).toEqual(nullAgentsSettings)
		})

		it('should use process.cwd() when projectRoot not provided', async () => {
			const validSettings = {
				agents: {
					'test-agent': {
						model: 'haiku',
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(validSettings))

			const result = await settingsManager.loadSettings()
			expect(result).toEqual(validSettings)
		})
	})

	describe('validateSettings', () => {
		it('should accept valid settings with all agents configured', () => {
			const validSettings = {
				agents: {
					'hatchbox-issue-analyzer': {
						model: 'sonnet',
					},
					'hatchbox-issue-planner': {
						model: 'opus',
					},
					'hatchbox-issue-implementer': {
						model: 'haiku',
					},
				},
			}

			// Should not throw
			expect(() => settingsManager['validateSettings'](validSettings)).not.toThrow()
		})

		it('should accept valid settings with partial agent configuration', () => {
			const partialSettings = {
				agents: {
					'hatchbox-issue-implementer': {
						model: 'haiku',
					},
				},
			}

			// Should not throw
			expect(() => settingsManager['validateSettings'](partialSettings)).not.toThrow()
		})

		it('should accept valid settings with empty agents object', () => {
			const emptySettings = {
				agents: {},
			}

			// Should not throw
			expect(() => settingsManager['validateSettings'](emptySettings)).not.toThrow()
		})

		it('should throw error for invalid model names', () => {
			const invalidSettings = {
				agents: {
					'test-agent': {
						model: 'invalid-model',
					},
				},
			}

			expect(() => settingsManager['validateSettings'](invalidSettings)).toThrow(
				/invalid model/i,
			)
		})

		it('should accept all valid shorthand model names', () => {
			const validModels = ['sonnet', 'opus', 'haiku']

			validModels.forEach(model => {
				const settings = {
					agents: {
						'test-agent': {
							model,
						},
					},
				}

				expect(() => settingsManager['validateSettings'](settings)).not.toThrow()
			})
		})

		it('should handle agent settings without model field', () => {
			const settingsWithoutModel = {
				agents: {
					'test-agent': {},
				},
			}

			// Should not throw - missing model is acceptable
			expect(() => settingsManager['validateSettings'](settingsWithoutModel)).not.toThrow()
		})

		it('should throw error when agents is not an object', () => {
			const invalidSettings = {
				agents: 'not an object',
			}

			expect(() =>
				settingsManager['validateSettings'](invalidSettings as never),
			).toThrow(/agents.*must be an object/i)
		})
	})

	describe('getProjectRoot', () => {
		it('should return process.cwd() when no projectRoot provided', () => {
			const result = settingsManager['getProjectRoot']()
			expect(result).toBe(process.cwd())
		})

		it('should return provided projectRoot when given', () => {
			const customRoot = '/custom/project/root'
			const result = settingsManager['getProjectRoot'](customRoot)
			expect(result).toBe(customRoot)
		})
	})

	describe('getSettingsPath', () => {
		it('should construct correct .hatchbox/settings.json path', () => {
			const projectRoot = '/test/project'
			const result = settingsManager['getSettingsPath'](projectRoot)
			expect(result).toBe('/test/project/.hatchbox/settings.json')
		})

		it('should handle paths with trailing slash', () => {
			const projectRoot = '/test/project/'
			const result = settingsManager['getSettingsPath'](projectRoot)
			expect(result).toBe('/test/project/.hatchbox/settings.json')
		})
	})
})
