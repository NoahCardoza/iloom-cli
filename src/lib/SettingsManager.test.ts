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
				/Settings validation failed[\s\S]*Expected object, received string/,
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

		it('should load settings with mainBranch field', async () => {
			const projectRoot = '/test/project'
			const settings = {
				mainBranch: 'develop',
				agents: {},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result.mainBranch).toBe('develop')
		})
	})

	describe('validateSettings', () => {
		describe('mainBranch setting validation', () => {
			it('should accept valid mainBranch string setting', () => {
				const settings = {
					mainBranch: 'develop',
				}
				// Should not throw
				expect(() => settingsManager['validateSettings'](settings)).not.toThrow()
			})

			it('should accept "main" as mainBranch', () => {
				const settings = {
					mainBranch: 'main',
				}
				expect(() => settingsManager['validateSettings'](settings)).not.toThrow()
			})

			it('should accept "master" as mainBranch', () => {
				const settings = {
					mainBranch: 'master',
				}
				expect(() => settingsManager['validateSettings'](settings)).not.toThrow()
			})

			it('should throw error when mainBranch is not a string', () => {
				const settings = {
					mainBranch: 123,
				}
				expect(() =>
					settingsManager['validateSettings'](settings as never),
				).toThrow(/mainBranch.*Expected string, received number/)
			})

			it('should throw error when mainBranch is empty string', () => {
				const settings = {
					mainBranch: '',
				}
				expect(() => settingsManager['validateSettings'](settings)).toThrow(
					/mainBranch.*cannot be empty/i,
				)
			})

			it('should accept settings with both mainBranch and agents', () => {
				const settings = {
					mainBranch: 'develop',
					agents: {
						'test-agent': {
							model: 'sonnet',
						},
					},
				}
				expect(() => settingsManager['validateSettings'](settings)).not.toThrow()
			})
		})

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
				/Invalid enum value.*Expected 'sonnet' \| 'opus' \| 'haiku'/,
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
			).toThrow(/agents.*Expected object, received string/)
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
