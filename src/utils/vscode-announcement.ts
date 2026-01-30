import chalk from 'chalk'
import stringWidth from 'string-width'
import { FirstRunManager } from './FirstRunManager.js'

const FEATURE_NAME = 'vscode-announcement'

/**
 * Check if announcement should be shown and display if so
 * @param commandName - The name of the command that just completed
 */
export async function showVSCodeAnnouncementIfNeeded(commandName: string): Promise<void> {
  // Skip if command is 'vscode'
  if (commandName === 'vscode') return

  // Skip if not TTY
  if (!process.stdout.isTTY) return

  // Check if already shown
  const manager = new FirstRunManager(FEATURE_NAME)
  const isFirstTime = await manager.isFirstRun()
  if (!isFirstTime) return

  // Display announcement
  displayAnnouncementBox()

  // Mark as shown
  await manager.markAsRun()
}

function displayAnnouncementBox(): void {
  const rocket = '\u{1F680}'
  const pointRight = '\u{1F449}'

  const lines = [
    `  ${rocket} New: iloom for VS Code is here!`,
    '',
    '  \u2022 Real-time Recap Panel: See AI decisions, insights, assumptions, and risks as they happen',
    '  \u2022 Loom Explorer: Manage projects/tasks visually',
    '',
    `  ${pointRight} Run 'il vscode' to install`,
  ]

  const maxWidth = Math.max(...lines.map(l => stringWidth(l)))
  const boxWidth = maxWidth + 6  // 2 spaces padding on each side + 2 border chars

 // eslint-disable-next-line no-console
  console.log('')
 // eslint-disable-next-line no-console
  console.log(chalk.cyan('\u256D' + '\u2500'.repeat(boxWidth - 2) + '\u256E'))
  for (const line of lines) {
    // Pad based on display width, not string length
    const displayWidth = stringWidth(line)
    const padding = ' '.repeat(maxWidth - displayWidth)
    // eslint-disable-next-line no-console
    console.log(chalk.cyan('\u2502') + '  ' + line + padding + '  ' + chalk.cyan('\u2502'))
  }
  // eslint-disable-next-line no-console
 console.log(chalk.cyan('\u2570' + '\u2500'.repeat(boxWidth - 2) + '\u256F'))
  // eslint-disable-next-line no-console
  console.log('')
}
