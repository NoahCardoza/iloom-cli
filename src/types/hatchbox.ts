export interface Hatchbox {
  id: string
  path: string
  branch: string
  type: 'issue' | 'pr' | 'branch'
  identifier: string | number
  port: number
  databaseBranch?: string
  createdAt: Date
  lastAccessed: Date
  githubData?: {
    title?: string
    body?: string
    url?: string
    state?: string
  }
}

export interface CreateHatchboxInput {
  type: 'issue' | 'pr' | 'branch'
  identifier: string | number
  originalInput: string
  baseBranch?: string
  options?: {
    urgent?: boolean
    skipClaude?: boolean
    skipDatabase?: boolean
  }
}

export type LaunchMode = 'editor' | 'terminal' | 'both'

export interface HatchboxSummary {
  id: string
  type: 'issue' | 'pr' | 'branch'
  identifier: string | number
  title?: string
  branch: string
  port: number
  status: 'active' | 'stale' | 'error'
  lastAccessed: string
}
