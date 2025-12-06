import { beforeEach } from 'vitest'

// Global test setup
// Note: Mock cleanup (clearMocks, resetMocks, restoreMocks) is handled by vitest.config.ts
beforeEach(() => {
  // Reset environment variables to clean state
  delete process.env.GITHUB_TOKEN
  delete process.env.CLAUDE_API_KEY
  delete process.env.NEON_API_KEY
})
