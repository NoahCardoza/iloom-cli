/* global AbortSignal */
import { execa, type ExecaChildProcess } from 'execa'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { logger } from './logger.js'

export interface CodexCliOptions {
	model?: string
	workingDirectory?: string
	addDirs?: string[]
	headless?: boolean
	sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access'
	approvalPolicy?: 'untrusted' | 'on-request' | 'never'
	fullAuto?: boolean
	dangerouslyBypassApprovalsAndSandbox?: boolean
	appendSystemPrompt?: string
	mcpConfig?: Record<string, unknown>[]
	jsonMode?: 'json' | 'stream'
	passthroughStdout?: boolean
	env?: Record<string, string>
	signal?: AbortSignal
}

interface CodexMcpServerConfig {
	transport?: string
	command?: string
	args?: unknown
	env?: Record<string, unknown>
	cwd?: string
	url?: string
	bearerTokenEnvVar?: string
	bearer_token_env_var?: string
}

/**
 * Detect if Codex CLI is available on the system.
 */
export async function detectCodexCli(): Promise<boolean> {
	try {
		await execa('command', ['-v', 'codex'], {
			shell: true,
			timeout: 5000,
		})
		return true
	} catch (error) {
		logger.debug('Codex CLI not available', { error })
		return false
	}
}

function attachAbortSignal(subprocess: ExecaChildProcess, signal?: AbortSignal): void {
	if (!signal) return

	const onAbort = (): void => {
		subprocess.kill('SIGTERM')
	}

	signal.addEventListener('abort', onAbort, { once: true })
	subprocess.on('exit', () => {
		signal.removeEventListener('abort', onAbort)
	})
}

function buildCodexPrompt(prompt: string, appendSystemPrompt?: string): string {
	if (!appendSystemPrompt) {
		return prompt
	}

	return `<planning_instructions>
${appendSystemPrompt.trim()}
</planning_instructions>

<user_request>
${prompt}
</user_request>`
}

function buildCodexMcpConfigOverrides(mcpConfig?: Record<string, unknown>[]): string[] {
	if (!mcpConfig || mcpConfig.length === 0) {
		return []
	}

	const args: string[] = []

	for (const config of mcpConfig) {
		const mcpServers = (config as { mcpServers?: Record<string, unknown> }).mcpServers
		if (!mcpServers) continue

		for (const [serverName, rawServer] of Object.entries(mcpServers)) {
			const server = rawServer as CodexMcpServerConfig

			if (server.url) {
				args.push('-c', `mcp_servers.${serverName}.url=${JSON.stringify(server.url)}`)
				const bearerTokenEnvVar = server.bearerTokenEnvVar ?? server.bearer_token_env_var
				if (bearerTokenEnvVar) {
					args.push(
						'-c',
						`mcp_servers.${serverName}.bearer_token_env_var=${JSON.stringify(bearerTokenEnvVar)}`
					)
				}
				continue
			}

			if (!server.command) {
				throw new Error(`Invalid MCP config for Codex: server "${serverName}" is missing a command`)
			}

			args.push('-c', `mcp_servers.${serverName}.command=${JSON.stringify(server.command)}`)

			if (server.args !== undefined) {
				if (!Array.isArray(server.args)) {
					throw new Error(`Invalid MCP config for Codex: server "${serverName}" args must be an array`)
				}
				args.push('-c', `mcp_servers.${serverName}.args=${JSON.stringify(server.args)}`)
			}

			if (server.cwd) {
				args.push('-c', `mcp_servers.${serverName}.cwd=${JSON.stringify(server.cwd)}`)
			}

			if (server.env) {
				for (const [key, value] of Object.entries(server.env)) {
					const normalizedValue =
						typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : JSON.stringify(value)
					args.push('-c', `mcp_servers.${serverName}.env.${key}=${JSON.stringify(normalizedValue)}`)
				}
			}
		}
	}

	return args
}

/**
 * Launch Codex CLI with specified options.
 * In headless mode, returns the final assistant message. In interactive mode, returns void.
 */
export async function launchCodex(
	prompt: string,
	options: CodexCliOptions = {}
): Promise<string | void> {
	const {
		model,
		workingDirectory,
		addDirs,
		headless = false,
		sandbox,
		approvalPolicy,
		fullAuto = false,
		dangerouslyBypassApprovalsAndSandbox = false,
		appendSystemPrompt,
		mcpConfig,
		jsonMode,
		passthroughStdout = false,
		env: extraEnv,
		signal,
	} = options

	const codexArgs = buildCodexMcpConfigOverrides(mcpConfig)
	const promptInput = buildCodexPrompt(prompt, appendSystemPrompt)
	const env = { ...process.env, ...extraEnv }

	if (headless) {
		const tempDir = await mkdtemp(join(tmpdir(), 'iloom-codex-'))
		const outputFile = join(tempDir, 'last-message.txt')
		const args: string[] = ['exec']

		if (model) {
			args.push('-m', model)
		}

		if (dangerouslyBypassApprovalsAndSandbox) {
			args.push('--dangerously-bypass-approvals-and-sandbox')
		} else if (fullAuto) {
			args.push('--full-auto')
		} else if (sandbox) {
			args.push('-s', sandbox)
		}

		if (workingDirectory) {
			args.push('-C', workingDirectory)
		}

		for (const dir of addDirs ?? []) {
			args.push('--add-dir', dir)
		}

		if (jsonMode) {
			args.push('--json')
		}

		args.push('-o', outputFile, ...codexArgs, '--', '-')

		try {
			if (passthroughStdout) {
				const subprocess = execa('codex', args, {
					timeout: 0,
					...(workingDirectory && { cwd: workingDirectory }),
					env,
					stdio: ['pipe', 'inherit', 'pipe'],
					input: promptInput,
				})
				attachAbortSignal(subprocess, signal)

				try {
					await subprocess
				} catch (error) {
					if (signal?.aborted) return
					throw error
				}
			} else {
				const subprocess = execa('codex', args, {
					timeout: 0,
					...(workingDirectory && { cwd: workingDirectory }),
					env,
					input: promptInput,
				})
				attachAbortSignal(subprocess, signal)

				try {
					await subprocess
				} catch (error) {
					if (signal?.aborted) return
					throw error
				}
			}

			const lastMessage = (await readFile(outputFile, 'utf-8')).trim()
			return lastMessage
		} catch (error) {
			if (signal?.aborted) return

			const execaError = error as {
				stderr?: string
				message?: string
			}
			const errorMessage = execaError.stderr ?? execaError.message ?? 'Unknown Codex CLI error'
			throw new Error(`Codex CLI error: ${errorMessage}`)
		} finally {
			await rm(tempDir, { recursive: true, force: true })
		}
	}

	const args: string[] = []

	if (model) {
		args.push('-m', model)
	}

	if (dangerouslyBypassApprovalsAndSandbox) {
		args.push('--dangerously-bypass-approvals-and-sandbox')
	} else {
		if (sandbox) {
			args.push('-s', sandbox)
		}
		if (approvalPolicy) {
			args.push('-a', approvalPolicy)
		}
	}

	if (workingDirectory) {
		args.push('-C', workingDirectory)
	}

	for (const dir of addDirs ?? []) {
		args.push('--add-dir', dir)
	}

	args.push(...codexArgs, '--', promptInput)

	try {
		const subprocess = execa('codex', args, {
			timeout: 0,
			...(workingDirectory && { cwd: workingDirectory }),
			env,
			stdio: 'inherit',
		})
		attachAbortSignal(subprocess, signal)

		try {
			await subprocess
		} catch (error) {
			if (signal?.aborted) return
			throw error
		}
	} catch (error) {
		if (signal?.aborted) return

		const execaError = error as {
			stderr?: string
			message?: string
		}
		const errorMessage = execaError.stderr ?? execaError.message ?? 'Unknown Codex CLI error'
		throw new Error(`Codex CLI error: ${errorMessage}`)
	}
}
