import { logger } from '../utils/logger.js'
import { detectPackageManager, runScript } from '../utils/package-manager.js'
import { readPackageJson, hasScript } from '../utils/package-json.js'
import type {
	ValidationOptions,
	ValidationResult,
	ValidationStepResult,
} from '../types/index.js'

/**
 * ValidationRunner orchestrates pre-merge validation pipeline
 * Runs typecheck, lint, and tests in sequence with fail-fast behavior
 */
export class ValidationRunner {
	/**
	 * Run all validations in sequence: typecheck → lint → test
	 * Fails fast on first error
	 */
	async runValidations(
		worktreePath: string,
		options: ValidationOptions = {}
	): Promise<ValidationResult> {
		const startTime = Date.now()
		const steps: ValidationStepResult[] = []

		// Run typecheck
		if (!options.skipTypecheck) {
			const typecheckResult = await this.runTypecheck(
				worktreePath,
				options.dryRun ?? false
			)
			steps.push(typecheckResult)

			if (!typecheckResult.passed && !typecheckResult.skipped) {
				return {
					success: false,
					steps,
					totalDuration: Date.now() - startTime,
				}
			}
		}

		// Run lint
		if (!options.skipLint) {
			const lintResult = await this.runLint(worktreePath, options.dryRun ?? false)
			steps.push(lintResult)

			if (!lintResult.passed && !lintResult.skipped) {
				return { success: false, steps, totalDuration: Date.now() - startTime }
			}
		}

		// Run tests
		if (!options.skipTests) {
			const testResult = await this.runTests(
				worktreePath,
				options.dryRun ?? false
			)
			steps.push(testResult)

			if (!testResult.passed && !testResult.skipped) {
				return { success: false, steps, totalDuration: Date.now() - startTime }
			}
		}

		return { success: true, steps, totalDuration: Date.now() - startTime }
	}

	/**
	 * Run typecheck validation
	 */
	private async runTypecheck(
		worktreePath: string,
		dryRun: boolean
	): Promise<ValidationStepResult> {
		const stepStartTime = Date.now()

		// Check if typecheck script exists
		const pkgJson = await readPackageJson(worktreePath)
		const hasTypecheckScript = hasScript(pkgJson, 'typecheck')

		if (!hasTypecheckScript) {
			logger.debug('Skipping typecheck - no typecheck script found')
			return {
				step: 'typecheck',
				passed: true,
				skipped: true,
				duration: Date.now() - stepStartTime,
			}
		}

		const packageManager = await detectPackageManager(worktreePath)

		if (dryRun) {
			const command =
				packageManager === 'npm'
					? 'npm run typecheck'
					: `${packageManager} typecheck`
			logger.info(`[DRY RUN] Would run: ${command}`)
			return {
				step: 'typecheck',
				passed: true,
				skipped: false,
				duration: Date.now() - stepStartTime,
			}
		}

		logger.info('Running typecheck...')

		try {
			await runScript('typecheck', worktreePath, [], { quiet: true })
			logger.success('Typecheck passed')

			return {
				step: 'typecheck',
				passed: true,
				skipped: false,
				duration: Date.now() - stepStartTime,
			}
		} catch {
			const runCommand =
				packageManager === 'npm'
					? 'npm run typecheck'
					: `${packageManager} typecheck`

			throw new Error(
				`Error: Typecheck failed.\n` +
					`Fix type errors before merging.\n\n` +
					`Run '${runCommand}' to see detailed errors.`
			)
		}
	}

	/**
	 * Run lint validation
	 */
	private async runLint(
		worktreePath: string,
		dryRun: boolean
	): Promise<ValidationStepResult> {
		const stepStartTime = Date.now()

		// Check if lint script exists
		const pkgJson = await readPackageJson(worktreePath)
		const hasLintScript = hasScript(pkgJson, 'lint')

		if (!hasLintScript) {
			logger.debug('Skipping lint - no lint script found')
			return {
				step: 'lint',
				passed: true,
				skipped: true,
				duration: Date.now() - stepStartTime,
			}
		}

		const packageManager = await detectPackageManager(worktreePath)

		if (dryRun) {
			const command =
				packageManager === 'npm' ? 'npm run lint' : `${packageManager} lint`
			logger.info(`[DRY RUN] Would run: ${command}`)
			return {
				step: 'lint',
				passed: true,
				skipped: false,
				duration: Date.now() - stepStartTime,
			}
		}

		logger.info('Running lint...')

		try {
			await runScript('lint', worktreePath, [], { quiet: true })
			logger.success('Linting passed')

			return {
				step: 'lint',
				passed: true,
				skipped: false,
				duration: Date.now() - stepStartTime,
			}
		} catch {
			const runCommand =
				packageManager === 'npm' ? 'npm run lint' : `${packageManager} lint`

			throw new Error(
				`Error: Linting failed.\n` +
					`Fix linting errors before merging.\n\n` +
					`Run '${runCommand}' to see detailed errors.`
			)
		}
	}

	/**
	 * Run test validation
	 */
	private async runTests(
		worktreePath: string,
		dryRun: boolean
	): Promise<ValidationStepResult> {
		const stepStartTime = Date.now()

		// Check if test script exists
		const pkgJson = await readPackageJson(worktreePath)
		const hasTestScript = hasScript(pkgJson, 'test')

		if (!hasTestScript) {
			logger.debug('Skipping tests - no test script found')
			return {
				step: 'test',
				passed: true,
				skipped: true,
				duration: Date.now() - stepStartTime,
			}
		}

		const packageManager = await detectPackageManager(worktreePath)

		if (dryRun) {
			const command =
				packageManager === 'npm' ? 'npm run test' : `${packageManager} test`
			logger.info(`[DRY RUN] Would run: ${command}`)
			return {
				step: 'test',
				passed: true,
				skipped: false,
				duration: Date.now() - stepStartTime,
			}
		}

		logger.info('Running tests...')

		try {
			await runScript('test', worktreePath, [], { quiet: true })
			logger.success('Tests passed')

			return {
				step: 'test',
				passed: true,
				skipped: false,
				duration: Date.now() - stepStartTime,
			}
		} catch {
			const runCommand =
				packageManager === 'npm' ? 'npm run test' : `${packageManager} test`

			throw new Error(
				`Error: Tests failed.\n` +
					`Fix test failures before merging.\n\n` +
					`Run '${runCommand}' to see detailed errors.`
			)
		}
	}
}
