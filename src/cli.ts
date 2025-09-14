import { program } from 'commander'
import chalk from 'chalk'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Get package.json for version
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as {
  version: string
  description: string
}

program.name('hatchbox').description(packageJson.description).version(packageJson.version)

program
  .command('start')
  .description('Create isolated workspace for an issue/PR')
  .argument('<identifier>', 'Issue number, PR number, or branch name')
  .option('--urgent', 'Mark as urgent workspace')
  .option('--no-claude', 'Skip Claude integration')
  .action(async (identifier: string, _options: { urgent?: boolean; claude?: boolean }) => {
    console.log(chalk.blue('🚀 Starting workspace for:'), chalk.bold(identifier))
    if (_options.urgent) {
      console.log(chalk.yellow('⚡ Urgent mode enabled'))
    }
    // TODO: Implement start command
    console.log(chalk.gray('Command not yet implemented'))
  })

program
  .command('finish')
  .description('Merge work and cleanup workspace')
  .argument('<identifier>', 'Issue number, PR number, or branch name')
  .option('--force', 'Force finish even with uncommitted changes')
  .action(async (_identifier: string, _options: { force?: boolean }) => {
    console.log(chalk.green('✅ Finishing workspace for:'), chalk.bold(_identifier))
    // TODO: Implement finish command
    console.log(chalk.gray('Command not yet implemented'))
  })

program
  .command('cleanup')
  .description('Remove workspaces')
  .argument('[identifier]', 'Specific workspace to cleanup (optional)')
  .option('--all', 'Remove all workspaces')
  .option('--issue <number>', 'Remove all workspaces for specific issue')
  .action(async (_identifier?: string, _options?: { all?: boolean; issue?: string }) => {
    console.log(chalk.red('🧹 Cleaning up workspaces'))
    // TODO: Implement cleanup command
    console.log(chalk.gray('Command not yet implemented'))
  })

program
  .command('list')
  .description('Show active workspaces')
  .option('--json', 'Output as JSON')
  .action(async (_options: { json?: boolean }) => {
    console.log(chalk.cyan('📋 Active workspaces:'))
    // TODO: Implement list command
    console.log(chalk.gray('No workspaces found (command not yet implemented)'))
  })

program
  .command('switch')
  .description('Switch to workspace context')
  .argument('<identifier>', 'Issue number, PR number, or branch name')
  .action(async (identifier: string) => {
    console.log(chalk.magenta('🔄 Switching to workspace:'), chalk.bold(identifier))
    // TODO: Implement switch command
    console.log(chalk.gray('Command not yet implemented'))
  })

// Parse CLI arguments
try {
  await program.parseAsync()
} catch (error) {
  if (error instanceof Error) {
    console.error(chalk.red('Error:'), error.message)
    process.exit(1)
  }
}
