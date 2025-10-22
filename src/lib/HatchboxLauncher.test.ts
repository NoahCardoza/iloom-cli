import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HatchboxLauncher } from './HatchboxLauncher.js'
import type { LaunchHatchboxOptions } from './HatchboxLauncher.js'
import * as terminal from '../utils/terminal.js'
import * as vscode from '../utils/vscode.js'
import * as devServer from '../utils/dev-server.js'
import { ClaudeContextManager } from './ClaudeContextManager.js'

// Mock all external dependencies
vi.mock('../utils/terminal.js')
vi.mock('../utils/vscode.js')
vi.mock('../utils/dev-server.js')
vi.mock('./ClaudeContextManager.js')
vi.mock('../utils/color.js', () => ({
	generateColorFromBranchName: vi.fn(() => ({
		rgb: { r: 0.5, g: 0.3, b: 0.7 },
		hex: '#8833bb',
		index: 0,
	})),
}))

describe('HatchboxLauncher', () => {
	let launcher: HatchboxLauncher
	let mockClaudeContext: { launchWithContext: ReturnType<typeof vi.fn> }

	const baseOptions: LaunchHatchboxOptions = {
		enableClaude: true,
		enableCode: true,
		enableDevServer: true,
		worktreePath: '/Users/test/workspace',
		branchName: 'feat/test-feature',
		port: 3042,
		capabilities: ['web'],
		workflowType: 'issue',
		identifier: 42,
		title: 'Test Issue',
	}

	beforeEach(() => {
		vi.clearAllMocks()

		// Mock ClaudeContextManager
		mockClaudeContext = {
			launchWithContext: vi.fn().mockResolvedValue(undefined),
		}
		vi.mocked(ClaudeContextManager).mockImplementation(() => mockClaudeContext)

		launcher = new HatchboxLauncher()
	})

	describe('launchHatchbox', () => {
		describe('all components enabled', () => {
			beforeEach(() => {
				vi.mocked(devServer.getDevServerLaunchCommand).mockResolvedValue(
					'code . && echo Starting... && pnpm dev'
				)
			})

			it('should launch all components when all are enabled', async () => {
				await launcher.launchHatchbox({
					...baseOptions,
					enableClaude: true,
					enableCode: true,
					enableDevServer: true,
				})

				// Should launch Claude
				expect(mockClaudeContext.launchWithContext).toHaveBeenCalledWith({
					workspacePath: baseOptions.worktreePath,
					type: 'issue',
					identifier: 42,
					branchName: baseOptions.branchName,
					title: baseOptions.title,
					port: baseOptions.port,
					oneShot: 'default',
				})

				// Should launch VSCode
				expect(vscode.openVSCodeWindow).toHaveBeenCalledWith(baseOptions.worktreePath)

				// Should launch dev server terminal (dual terminals)
				expect(terminal.openTerminalWindow).toHaveBeenCalled()
			})

			it('should handle PR workflow type', async () => {
				await launcher.launchHatchbox({
					...baseOptions,
					workflowType: 'pr',
				})

				expect(mockClaudeContext.launchWithContext).toHaveBeenCalledWith(
					expect.objectContaining({
						type: 'pr',
					})
				)
			})

			it('should handle regular workflow type', async () => {
				await launcher.launchHatchbox({
					...baseOptions,
					workflowType: 'regular',
				})

				expect(mockClaudeContext.launchWithContext).toHaveBeenCalledWith(
					expect.objectContaining({
						type: 'regular',
					})
				)
			})
		})

		describe('individual components', () => {
			it('should launch only Claude when only Claude enabled', async () => {
				await launcher.launchHatchbox({
					...baseOptions,
					enableClaude: true,
					enableCode: false,
					enableDevServer: false,
				})

				expect(mockClaudeContext.launchWithContext).toHaveBeenCalled()
				expect(vscode.openVSCodeWindow).not.toHaveBeenCalled()
				expect(terminal.openTerminalWindow).not.toHaveBeenCalled()
			})

			it('should launch only VSCode when only Code enabled', async () => {
				await launcher.launchHatchbox({
					...baseOptions,
					enableClaude: false,
					enableCode: true,
					enableDevServer: false,
				})

				expect(vscode.openVSCodeWindow).toHaveBeenCalledWith(baseOptions.worktreePath)
				expect(mockClaudeContext.launchWithContext).not.toHaveBeenCalled()
				expect(terminal.openTerminalWindow).not.toHaveBeenCalled()
			})

			it('should launch only dev server terminal when only DevServer enabled', async () => {
				vi.mocked(devServer.getDevServerLaunchCommand).mockResolvedValue(
					'code . && echo Starting... && pnpm dev'
				)

				await launcher.launchHatchbox({
					...baseOptions,
					enableClaude: false,
					enableCode: false,
					enableDevServer: true,
				})

				expect(terminal.openTerminalWindow).toHaveBeenCalled()
				expect(mockClaudeContext.launchWithContext).not.toHaveBeenCalled()
				expect(vscode.openVSCodeWindow).not.toHaveBeenCalled()
			})

			it('should launch nothing when all components disabled', async () => {
				await launcher.launchHatchbox({
					...baseOptions,
					enableClaude: false,
					enableCode: false,
					enableDevServer: false,
				})

				expect(mockClaudeContext.launchWithContext).not.toHaveBeenCalled()
				expect(vscode.openVSCodeWindow).not.toHaveBeenCalled()
				expect(terminal.openTerminalWindow).not.toHaveBeenCalled()
			})
		})

		describe('component combinations', () => {
			beforeEach(() => {
				vi.mocked(devServer.getDevServerLaunchCommand).mockResolvedValue(
					'code . && echo Starting... && pnpm dev'
				)
			})

			it('should launch Claude + VSCode when both enabled', async () => {
				await launcher.launchHatchbox({
					...baseOptions,
					enableClaude: true,
					enableCode: true,
					enableDevServer: false,
				})

				expect(mockClaudeContext.launchWithContext).toHaveBeenCalled()
				expect(vscode.openVSCodeWindow).toHaveBeenCalledWith(baseOptions.worktreePath)
				expect(terminal.openTerminalWindow).not.toHaveBeenCalled()
			})

			it('should launch Claude + DevServer when both enabled', async () => {
				await launcher.launchHatchbox({
					...baseOptions,
					enableClaude: true,
					enableCode: false,
					enableDevServer: true,
				})

				expect(mockClaudeContext.launchWithContext).toHaveBeenCalled()
				expect(terminal.openTerminalWindow).toHaveBeenCalled()
				expect(vscode.openVSCodeWindow).not.toHaveBeenCalled()
			})

			it('should launch VSCode + DevServer when both enabled', async () => {
				await launcher.launchHatchbox({
					...baseOptions,
					enableClaude: false,
					enableCode: true,
					enableDevServer: true,
				})

				expect(vscode.openVSCodeWindow).toHaveBeenCalled()
				expect(terminal.openTerminalWindow).toHaveBeenCalled()
				expect(mockClaudeContext.launchWithContext).not.toHaveBeenCalled()
			})

			it('should launch dual terminals when Claude and DevServer both enabled', async () => {
				const callOrder: string[] = []

				mockClaudeContext.launchWithContext.mockImplementation(() => {
					callOrder.push('claude')
					return Promise.resolve()
				})

				vi.mocked(terminal.openTerminalWindow).mockImplementation(() => {
					callOrder.push('terminal')
					return Promise.resolve()
				})

				await launcher.launchHatchbox({
					...baseOptions,
					enableClaude: true,
					enableCode: false,
					enableDevServer: true,
				})

				expect(callOrder).toEqual(['claude', 'terminal'])
			})

			it('should wait before launching dev server terminal in dual mode', async () => {
				vi.useFakeTimers()

				const promise = launcher.launchHatchbox({
					...baseOptions,
					enableClaude: true,
					enableCode: false,
					enableDevServer: true,
				})

				// Claude should be called immediately
				expect(mockClaudeContext.launchWithContext).toHaveBeenCalled()

				// Dev server terminal should not be called yet
				expect(terminal.openTerminalWindow).not.toHaveBeenCalled()

				// Advance time by 1 second
				await vi.advanceTimersByTimeAsync(1000)

				// Now dev server terminal should be called
				await promise
				expect(terminal.openTerminalWindow).toHaveBeenCalled()

				vi.useRealTimers()
			})

			it('should export PORT when project has web capability', async () => {
				await launcher.launchHatchbox({
					...baseOptions,
					enableClaude: false,
					enableCode: false,
					enableDevServer: true,
					capabilities: ['web'],
				})

				const call = vi.mocked(terminal.openTerminalWindow).mock.calls[0][0]
				expect(call.includePortExport).toBe(true)
				expect(call.port).toBe(3042)
			})

			it('should apply background color to terminal', async () => {
				await launcher.launchHatchbox({
					...baseOptions,
					enableClaude: false,
					enableCode: false,
					enableDevServer: true,
				})

				const call = vi.mocked(terminal.openTerminalWindow).mock.calls[0][0]
				expect(call.backgroundColor).toEqual({ r: 0.5, g: 0.3, b: 0.7 })
			})
		})

		describe('error handling', () => {
			it('should throw when platform not supported for terminal launching', async () => {
				vi.mocked(terminal.openTerminalWindow).mockRejectedValue(
					new Error('Terminal window launching not yet supported on linux')
				)

				await expect(
					launcher.launchHatchbox({
						...baseOptions,
						enableClaude: false,
						enableCode: false,
						enableDevServer: true,
					})
				).rejects.toThrow('not yet supported on linux')
			})

			it('should throw when VSCode required but not available', async () => {
				vi.mocked(vscode.openVSCodeWindow).mockRejectedValue(
					new Error('VSCode is not available')
				)

				await expect(
					launcher.launchHatchbox({
						...baseOptions,
						enableClaude: false,
						enableCode: true,
						enableDevServer: false,
					})
				).rejects.toThrow('VSCode is not available')
			})

			it('should throw when Claude context manager fails', async () => {
				mockClaudeContext.launchWithContext.mockRejectedValue(
					new Error('Claude CLI not found')
				)

				await expect(
					launcher.launchHatchbox({
						...baseOptions,
						enableClaude: true,
						enableCode: false,
						enableDevServer: false,
					})
				).rejects.toThrow('Claude CLI not found')
			})

			it('should throw when dev server command generation fails', async () => {
				vi.mocked(devServer.getDevServerLaunchCommand).mockRejectedValue(
					new Error('No package.json found')
				)

				await expect(
					launcher.launchHatchbox({
						...baseOptions,
						enableClaude: false,
						enableCode: false,
						enableDevServer: true,
					})
				).rejects.toThrow('No package.json found')
			})
		})
	})
})
