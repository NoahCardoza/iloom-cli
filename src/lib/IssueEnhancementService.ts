import type { GitHubService } from './GitHubService.js'
import type { AgentManager } from './AgentManager.js'
import type { SettingsManager } from './SettingsManager.js'
import { launchClaude } from '../utils/claude.js'
import { openBrowser } from '../utils/browser.js'
import { waitForKeypress } from '../utils/prompt.js'
import { logger } from '../utils/logger.js'

/**
 * Service for enhancing and creating GitHub issues with AI assistance.
 * Extracts reusable issue enhancement logic from StartCommand.
 */
export class IssueEnhancementService {
	constructor(
		private gitHubService: GitHubService,
		private agentManager: AgentManager,
		private settingsManager: SettingsManager
	) {}

	/**
	 * Validates that a description meets minimum requirements.
	 * Requirements: >50 characters AND >2 spaces
	 */
	public validateDescription(description: string): boolean {
		const trimmedDescription = description.trim()
		const spaceCount = (trimmedDescription.match(/ /g) ?? []).length

		return trimmedDescription.length > 50 && spaceCount > 2
	}

	/**
	 * Enhances a description using Claude AI in headless mode.
	 * Falls back to original description if enhancement fails.
	 */
	public async enhanceDescription(description: string): Promise<string> {
		try {
			logger.info('Enhancing description with Claude AI. This may take a moment...')

			// Load agent configurations
			const settings = await this.settingsManager.loadSettings()
			const loadedAgents = await this.agentManager.loadAgents(settings)
			const agents = this.agentManager.formatForCli(loadedAgents)

			// Call Claude in headless mode with issue enhancer agent
			const prompt = `Ask @agent-hatchbox-issue-enhancer to enhance this prompt: ${description}. Return only the description of the issue, nothing else`

			const enhanced = await launchClaude(prompt, {
				headless: true,
				model: 'sonnet',
				agents,
			})

			if (enhanced && typeof enhanced === 'string') {
				logger.success('Description enhanced successfully')
				return enhanced
			}

			// Fallback to original description
			logger.warn('Claude enhancement returned empty result, using original description')
			return description
		} catch (error) {
			logger.warn(`Failed to enhance description: ${error instanceof Error ? error.message : 'Unknown error'}`)
			return description
		}
	}

	/**
	 * Creates a GitHub issue with title and enhanced body.
	 * @param originalDescription - Used as the issue title
	 * @param enhancedDescription - Used as the issue body
	 * @returns Issue number and URL
	 */
	public async createEnhancedIssue(
		originalDescription: string,
		enhancedDescription: string
	): Promise<{ number: number; url: string }> {
		logger.info('Creating GitHub issue from description...')

		const result = await this.gitHubService.createIssue(
			originalDescription,  // Use original description as title
			enhancedDescription  // Use enhanced description as body
		)

		return result
	}

	/**
	 * Waits for user keypress and opens issue in browser for review.
	 * Command exits immediately after opening browser.
	 */
	public async waitForReviewAndOpen(issueNumber: number): Promise<void> {
		// Get issue URL
		const issueUrl = await this.gitHubService.getIssueUrl(issueNumber)

		// Display message and wait for keypress
		logger.info(`Created issue #${issueNumber}.`)
		logger.info('Review and edit the issue in your browser if needed.')
		logger.info('Press any key to open issue for editing...')
		await waitForKeypress('')

		// Open issue in browser and exit
		await openBrowser(issueUrl)
	}
}
