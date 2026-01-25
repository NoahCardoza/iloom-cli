/* global fetch, AbortController, setTimeout, clearTimeout */
import { tmpdir } from 'node:os'
import { join, extname } from 'node:path'
import { existsSync, mkdirSync, createWriteStream, unlinkSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { createHash } from 'node:crypto'
import { execa } from 'execa'
import { logger } from './logger.js'
import type { IssueProvider } from '../mcp/types.js'

/**
 * Represents a matched image in markdown content
 */
export interface ImageMatch {
  fullMatch: string
  url: string
  isMarkdown: boolean  // true for ![](url), false for <img>
}

/**
 * Supported image extensions
 */
const SUPPORTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']

/**
 * Maximum allowed image size (10MB)
 */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024

/**
 * Request timeout in milliseconds (30 seconds)
 */
const REQUEST_TIMEOUT_MS = 30000

/**
 * Cache directory path for downloaded images
 */
export const CACHE_DIR = join(tmpdir(), 'iloom-images')

/**
 * Cached GitHub auth token (module-level to avoid repeated `gh auth token` calls)
 */
let cachedGitHubToken: string | undefined

/**
 * Extract all image URLs from markdown content
 * Handles both ![alt](url) and <img src="url"> formats
 *
 * @param content - Markdown content to parse
 * @returns Array of image matches with full match string and URL
 */
export function extractMarkdownImageUrls(content: string): ImageMatch[] {
  if (!content) {
    return []
  }

  const matches: ImageMatch[] = []

  // Regex for markdown images: ![alt](url)
  // Captures the entire match and the URL separately
  // Handles parentheses in URLs by matching balanced parens
  // The URL part matches: non-paren chars OR (balanced paren group)*, followed by non-paren/non-space chars
  const markdownRegex = /!\[([^\]]*)\]\(((?:[^()\s]|\((?:[^()\s]|\([^()]*\))*\))+)\)/g
  let match: RegExpExecArray | null

  while ((match = markdownRegex.exec(content)) !== null) {
    const url = match[2]
    if (url) {
      matches.push({
        fullMatch: match[0],
        url,
        isMarkdown: true
      })
    }
  }

  // Regex for HTML img tags: <img ... src="url" ...>
  // Handles both double and single quotes, and self-closing tags
  const htmlImgRegex = /<img\s+[^>]*src=["']([^"']+)["'][^>]*\/?>/gi

  while ((match = htmlImgRegex.exec(content)) !== null) {
    const url = match[1]
    if (url) {
      matches.push({
        fullMatch: match[0],
        url,
        isMarkdown: false
      })
    }
  }

  return matches
}

/**
 * Check if URL requires authentication to download
 * - Linear: uploads.linear.app
 * - GitHub: private-user-images.githubusercontent.com
 *
 * @param url - Image URL to check
 * @returns true if URL requires authentication
 */
export function isAuthenticatedImageUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url)
    const hostname = parsedUrl.hostname.toLowerCase()

    // Linear uploads require authentication
    if (hostname === 'uploads.linear.app') {
      return true
    }

    // GitHub private user images require authentication
    if (hostname === 'private-user-images.githubusercontent.com') {
      return true
    }

    // GitHub user-attachments (uploaded images in issues/PRs) require authentication
    if (hostname === 'github.com' && parsedUrl.pathname.startsWith('/user-attachments/assets/')) {
      return true
    }

    return false
  } catch {
    // Invalid URL - treat as not authenticated
    return false
  }
}

/**
 * Get extension from URL pathname
 *
 * @param url - URL to extract extension from
 * @returns Extension including dot (e.g., '.png') or null if not found
 */
function getExtensionFromUrl(url: string): string | null {
  try {
    const parsedUrl = new URL(url)
    const pathname = parsedUrl.pathname
    const ext = extname(pathname).toLowerCase()

    if (SUPPORTED_EXTENSIONS.includes(ext)) {
      return ext
    }
    return null
  } catch {
    return null
  }
}

/**
 * Generate cache key from URL
 * For GitHub URLs, strips JWT query params to ensure consistent caching
 * Returns hash + original extension
 *
 * @param url - Image URL to generate cache key for
 * @returns Cache key (hash + extension)
 */
export function getCacheKey(url: string): string {
  const parsedUrl = new URL(url)

  // For GitHub private images, remove jwt query param to get stable cache key
  // The jwt changes each fetch but the base URL is the same for the same image
  if (parsedUrl.hostname === 'private-user-images.githubusercontent.com') {
    parsedUrl.searchParams.delete('jwt')
  }

  // Get URL without volatile params for hashing
  const stableUrl = parsedUrl.toString()

  // Generate SHA256 hash of the stable URL (first 16 chars for brevity)
  const hash = createHash('sha256').update(stableUrl).digest('hex').slice(0, 16)

  // Extract extension from URL pathname, default to .png
  const ext = getExtensionFromUrl(url) ?? '.png'

  return `${hash}${ext}`
}

/**
 * Check if image is already cached
 * Returns file path if exists, undefined otherwise
 *
 * @param url - Image URL to check cache for
 * @returns Cached file path or undefined
 */
export function getCachedImagePath(url: string): string | undefined {
  const cacheKey = getCacheKey(url)
  const cachedPath = join(CACHE_DIR, cacheKey)

  if (existsSync(cachedPath)) {
    return cachedPath
  }
  return undefined
}

/**
 * Get authentication token for the given provider
 *
 * @param provider - Provider type ('github' or 'linear')
 * @returns Authentication token or undefined
 */
async function getAuthToken(provider: IssueProvider): Promise<string | undefined> {
  if (provider === 'github') {
    // Return cached token if available
    if (cachedGitHubToken !== undefined) {
      return cachedGitHubToken
    }

    try {
      // Execute `gh auth token` to get GitHub token
      const result = await execa('gh', ['auth', 'token'])
      cachedGitHubToken = result.stdout.trim()
      return cachedGitHubToken
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn(`Failed to get GitHub auth token via gh CLI: ${message}`)
      return undefined
    }
  }

  if (provider === 'linear') {
    // Linear token from environment variable
    return process.env.LINEAR_API_TOKEN
  }

  return undefined
}

/**
 * Clear the cached GitHub auth token (for testing purposes)
 */
export function clearCachedGitHubToken(): void {
  cachedGitHubToken = undefined
}

/**
 * Download image from URL and stream it directly to a file
 *
 * @param url - Image URL to download
 * @param destPath - Destination file path
 * @param authHeader - Optional Authorization header value
 * @throws Error if download fails, times out, or exceeds size limit
 */
export async function downloadAndSaveImage(
  url: string,
  destPath: string,
  authHeader?: string
): Promise<void> {
  const headers: Record<string, string> = {}
  if (authHeader) {
    headers['Authorization'] = authHeader
  }

  // Set up abort controller for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, { headers, signal: controller.signal })

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`)
    }

    // Check Content-Length header if available
    const contentLength = response.headers.get('Content-Length')
    if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE) {
      throw new Error(`Image too large: ${contentLength} bytes exceeds ${MAX_IMAGE_SIZE} byte limit`)
    }

    if (!response.body) {
      throw new Error('Response body is null')
    }

    // Convert ReadableStream to Node.js Readable
    const reader = response.body.getReader()
    let bytesWritten = 0

    const nodeReadable = new Readable({
      async read(): Promise<void> {
        try {
          const { done, value } = await reader.read()
          if (done) {
            this.push(null)
            return
          }

          bytesWritten += value.byteLength
          if (bytesWritten > MAX_IMAGE_SIZE) {
            reader.cancel()
            this.destroy(new Error(`Image too large: ${bytesWritten} bytes exceeds ${MAX_IMAGE_SIZE} byte limit`))
            return
          }

          this.push(Buffer.from(value))
        } catch (err) {
          this.destroy(err instanceof Error ? err : new Error(String(err)))
        }
      }
    })

    // Ensure cache directory exists
    if (!existsSync(CACHE_DIR)) {
      mkdirSync(CACHE_DIR, { recursive: true })
    }

    // Stream to file
    const writeStream = createWriteStream(destPath)

    try {
      await pipeline(nodeReadable, writeStream)
    } catch (pipelineError) {
      // Clean up partial file on error
      try {
        if (existsSync(destPath)) {
          unlinkSync(destPath)
        }
      } catch {
        // Ignore cleanup errors
      }
      throw pipelineError
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Image download timed out after ${REQUEST_TIMEOUT_MS}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Get the destination path for caching an image
 *
 * @param url - Original image URL (used to generate cache key)
 * @returns Local file path where image should be saved
 */
export function getCacheDestPath(url: string): string {
  // Ensure cache directory exists
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true })
  }

  // Generate cache key from URL
  const cacheKey = getCacheKey(url)
  return join(CACHE_DIR, cacheKey)
}

/**
 * Rewrite image URLs in markdown content
 *
 * @param content - Original markdown content
 * @param urlMap - Map of original URLs to local file paths
 * @returns Content with URLs replaced
 */
export function rewriteMarkdownUrls(
  content: string,
  urlMap: Map<string, string>
): string {
  let result = content

  for (const [originalUrl, localPath] of urlMap) {
    // Escape special regex characters in the URL
    const escapedUrl = originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const urlRegex = new RegExp(escapedUrl, 'g')
    result = result.replace(urlRegex, localPath)
  }

  return result
}

/**
 * Main entry point: process all images in markdown content
 * Downloads authenticated images (with caching), saves locally, rewrites URLs
 *
 * @param content - Markdown content to process
 * @param provider - Image provider for authentication ('github' or 'linear')
 * @returns Content with authenticated image URLs replaced with local file paths
 */
export async function processMarkdownImages(
  content: string,
  provider: IssueProvider
): Promise<string> {
  // Early return if empty
  if (!content) {
    return ''
  }

  // Extract all image URLs
  const images = extractMarkdownImageUrls(content)
  if (images.length === 0) {
    return content
  }

  // Filter to only authenticated URLs
  const authImages = images.filter(img => isAuthenticatedImageUrl(img.url))
  if (authImages.length === 0) {
    return content
  }

  // Get auth token for provider
  const authToken = await getAuthToken(provider)

  // Deduplicate URLs (same image might appear multiple times)
  const uniqueUrls = [...new Set(authImages.map(img => img.url))]

  // Build URL map - process all unique URLs in parallel
  const urlMap = new Map<string, string>()

  // Download/cache images in parallel
  const downloadPromises = uniqueUrls.map(async (url) => {
    try {
      // Check cache first
      const cachedPath = getCachedImagePath(url)
      if (cachedPath) {
        logger.debug(`Using cached image: ${cachedPath}`)
        return { url, localPath: cachedPath }
      }

      // Cache miss - download and stream directly to file
      logger.debug(`Downloading image: ${url}`)
      const destPath = getCacheDestPath(url)
      await downloadAndSaveImage(
        url,
        destPath,
        authToken ? `Bearer ${authToken}` : undefined
      )
      return { url, localPath: destPath }
    } catch (error) {
      // Graceful degradation - log warning, return null to keep original URL
      const message = error instanceof Error ? error.message : String(error)
      logger.warn(`Failed to download image ${url}: ${message}`)
      return null
    }
  })

  const results = await Promise.all(downloadPromises)

  // Build URL map from results
  for (const result of results) {
    if (result !== null) {
      urlMap.set(result.url, result.localPath)
    }
  }

  // Rewrite and return
  return rewriteMarkdownUrls(content, urlMap)
}
