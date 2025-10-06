export interface EnvVariable {
  key: string
  value: string
}

export interface EnvFileOptions {
  path: string
  backup?: boolean
  encoding?: BufferEncoding
}

export interface EnvOperationResult {
  success: boolean
  backupPath?: string
  error?: string
}

export interface PortAssignmentOptions {
  basePort?: number
  issueNumber?: number
  prNumber?: number
}
