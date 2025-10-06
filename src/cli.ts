import { program } from 'commander'
import { logger } from './utils/logger.js'
import { GitWorktreeManager } from './lib/GitWorktreeManager.js'
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

// Helper for unimplemented commands
function notImplemented(
  commandName: string,
  requirements: string[],
  bashScript?: string
): void {
  logger.error(`❌ The "${commandName}" command is not yet implemented`)
  logger.info('This command requires:')
  for (const requirement of requirements) {
    logger.info(`  - ${requirement}`)
  }
  if (bashScript) {
    logger.info('')
    logger.info('For now, use the bash script:')
    logger.info(`  ${bashScript}`)
  }
  process.exit(1)
}

program.name('hatchbox').description(packageJson.description).version(packageJson.version)

program
  .command('start')
  .description('Create isolated workspace for an issue/PR')
  .argument('<identifier>', 'Issue number, PR number, or branch name')
  .option('--urgent', 'Mark as urgent workspace')
  .option('--no-claude', 'Skip Claude integration')
  .action((identifier: string) => {
    notImplemented(
      'start',
      ['GitHubService (Issue #3)', 'EnvironmentManager (Issue #4)', 'WorkspaceManager (Issue #6)', 'ClaudeContextManager (Issue #11)'],
      `bash/new-branch-workflow.sh ${identifier}`
    )
  })

program
  .command('finish')
  .description('Merge work and cleanup workspace')
  .argument('<identifier>', 'Issue number, PR number, or branch name')
  .option('--force', 'Force finish even with uncommitted changes')
  .action((identifier: string) => {
    notImplemented(
      'finish',
      ['GitHubService (Issue #3)', 'DatabaseManager (Issue #5)', 'WorkspaceManager (Issue #6)'],
      `bash/merge-and-clean.sh ${identifier}`
    )
  })

program
  .command('cleanup')
  .description('Remove workspaces')
  .argument('[identifier]', 'Specific workspace to cleanup (optional)')
  .option('--all', 'Remove all workspaces')
  .option('--force', 'Force removal even with uncommitted changes')
  .option('--remove-branch', 'Also remove the associated branch')
  .action(async (identifier?: string, options?: { all?: boolean; force?: boolean; removeBranch?: boolean }) => {
    try {
      const manager = new GitWorktreeManager()

      // Determine which worktrees to remove
      let toRemove = identifier
        ? await manager.findWorktreesByIdentifier(identifier)
        : await manager.listWorktrees({ porcelain: true })

      // Validate input
      if (!identifier && !options?.all) {
        logger.error('Either provide an identifier or use --all flag')
        process.exit(1)
      }

      if (identifier && toRemove.length === 0) {
        logger.error(`No worktree found matching: ${identifier}`)
        process.exit(1)
      }

      logger.info(`🧹 Removing ${toRemove.length} worktree(s)...`)

      // Remove worktrees
      const { successes, failures, skipped } = await manager.removeWorktrees(toRemove, {
        force: options?.force ?? false,
        removeBranch: options?.removeBranch ?? false,
      })

      // Report results
      for (const { worktree } of successes) {
        logger.success(`Removed: ${worktree.branch}`)
      }

      for (const { worktree, reason } of skipped) {
        logger.info(`Skipped: ${worktree.branch} (${reason})`)
      }

      for (const { worktree, error } of failures) {
        logger.error(`Failed to remove ${worktree.branch}: ${error}`)
      }

      if (successes.length === 0 && failures.length === 0) {
        logger.info('No worktrees to remove')
      }

      if (failures.length > 0) {
        process.exit(1)
      }
    } catch (error) {
      logger.error(`Failed to cleanup worktrees: ${error instanceof Error ? error.message : 'Unknown error'}`)
      process.exit(1)
    }
  })

program
  .command('list')
  .description('Show active workspaces')
  .option('--json', 'Output as JSON')
  .action(async (options: { json?: boolean }) => {
    try {
      const manager = new GitWorktreeManager()
      const worktrees = await manager.listWorktrees({ porcelain: true })

      if (options.json) {
        console.log(JSON.stringify(worktrees, null, 2))
        return
      }

      if (worktrees.length === 0) {
        logger.info('No worktrees found')
        return
      }

      logger.info('📋 Active workspaces:')
      for (const worktree of worktrees) {
        const formatted = manager.formatWorktree(worktree)
        logger.info(`  ${formatted.title}`)
        logger.info(`    Path: ${formatted.path}`)
        logger.info(`    Commit: ${formatted.commit}`)
      }
    } catch (error) {
      logger.error(`Failed to list worktrees: ${error instanceof Error ? error.message : 'Unknown error'}`)
      process.exit(1)
    }
  })

program
  .command('switch')
  .description('Switch to workspace context')
  .argument('<identifier>', 'Issue number, PR number, or branch name')
  .action((identifier: string) => {
    notImplemented(
      'switch',
      ['Workspace context management'],
      `cd $(git worktree list | grep ${identifier} | awk '{print $1}')`
    )
  })

// Parse CLI arguments
try {
  await program.parseAsync()
} catch (error) {
  if (error instanceof Error) {
    logger.error(`Error: ${error.message}`)
    process.exit(1)
  }
}
