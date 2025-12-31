import type { Migration } from '../lib/VersionMigrationManager.js'

// Migration registry - add new migrations here in version order
// Each migration must be idempotent (safe to run multiple times)
export const migrations: Migration[] = [
  // v0.6.0 is the baseline - no migrations needed
  // Future migrations will be added here, e.g.:
  // {
  //   version: '0.7.0',
  //   description: 'Add new config field',
  //   migrate: async () => { /* idempotent migration logic */ }
  // }
]
