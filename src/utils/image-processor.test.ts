/* global ReadableStream */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'

// Mock execa before importing the module
vi.mock('execa', () => ({
  execa: vi.fn()
}))

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Import after mocking
import {
  extractMarkdownImageUrls,
  isAuthenticatedImageUrl,
  getCacheKey,
  getCachedImagePath,
  downloadAndSaveImage,
  getCacheDestPath,
  rewriteMarkdownUrls,
  processMarkdownImages,
  clearCachedGitHubToken,
  CACHE_DIR
} from './image-processor.js'
import { execa } from 'execa'

describe('ImageProcessor', () => {
  // Clear cached GitHub token before each test to ensure test isolation
  beforeEach(() => {
    clearCachedGitHubToken()
  })
  describe('extractMarkdownImageUrls', () => {
    test('extracts standard markdown image syntax: ![alt](url)', () => {
      const content = 'Here is an image: ![screenshot](https://example.com/image.png)'
      const result = extractMarkdownImageUrls(content)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        fullMatch: '![screenshot](https://example.com/image.png)',
        url: 'https://example.com/image.png',
        isMarkdown: true
      })
    })

    test('extracts HTML img tags: <img src="url">', () => {
      const content = 'Here is an image: <img src="https://example.com/image.png">'
      const result = extractMarkdownImageUrls(content)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        fullMatch: '<img src="https://example.com/image.png">',
        url: 'https://example.com/image.png',
        isMarkdown: false
      })
    })

    test('extracts HTML img tags with single quotes', () => {
      const content = "Here is an image: <img src='https://example.com/image.png'>"
      const result = extractMarkdownImageUrls(content)

      expect(result).toHaveLength(1)
      expect(result[0].url).toBe('https://example.com/image.png')
    })

    test('extracts HTML img tags with additional attributes', () => {
      const content = '<img alt="test" src="https://example.com/image.png" width="100">'
      const result = extractMarkdownImageUrls(content)

      expect(result).toHaveLength(1)
      expect(result[0].url).toBe('https://example.com/image.png')
    })

    test('returns empty array for empty content', () => {
      expect(extractMarkdownImageUrls('')).toEqual([])
    })

    test('handles mixed content with text and images', () => {
      const content = `
# Title

Some text here

![first](https://example.com/first.png)

More text

<img src="https://example.com/second.jpg">

End of content
      `
      const result = extractMarkdownImageUrls(content)

      expect(result).toHaveLength(2)
      expect(result[0].url).toBe('https://example.com/first.png')
      expect(result[1].url).toBe('https://example.com/second.jpg')
    })

    test('handles duplicate URLs', () => {
      const content = '![a](https://example.com/image.png) ![b](https://example.com/image.png)'
      const result = extractMarkdownImageUrls(content)

      expect(result).toHaveLength(2)
      expect(result[0].url).toBe('https://example.com/image.png')
      expect(result[1].url).toBe('https://example.com/image.png')
    })

    test('handles markdown images with empty alt text', () => {
      const content = '![](https://example.com/image.png)'
      const result = extractMarkdownImageUrls(content)

      expect(result).toHaveLength(1)
      expect(result[0].url).toBe('https://example.com/image.png')
    })

    test('handles self-closing img tags', () => {
      const content = '<img src="https://example.com/image.png" />'
      const result = extractMarkdownImageUrls(content)

      expect(result).toHaveLength(1)
      expect(result[0].url).toBe('https://example.com/image.png')
    })

    test('handles URLs with parentheses', () => {
      const content = '![screenshot](https://example.com/image(1).png)'
      const result = extractMarkdownImageUrls(content)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        fullMatch: '![screenshot](https://example.com/image(1).png)',
        url: 'https://example.com/image(1).png',
        isMarkdown: true
      })
    })

    test('handles URLs with nested parentheses', () => {
      const content = '![](https://example.com/path(nested(deep))/file.png)'
      const result = extractMarkdownImageUrls(content)

      expect(result).toHaveLength(1)
      expect(result[0].url).toBe('https://example.com/path(nested(deep))/file.png')
    })

    test('handles multiple images with parentheses in URLs', () => {
      const content = `
![first](https://example.com/image(1).png)
![second](https://example.com/image(2).jpg)
      `.trim()
      const result = extractMarkdownImageUrls(content)

      expect(result).toHaveLength(2)
      expect(result[0].url).toBe('https://example.com/image(1).png')
      expect(result[1].url).toBe('https://example.com/image(2).jpg')
    })
  })

  describe('isAuthenticatedImageUrl', () => {
    test('returns true for Linear uploads.linear.app URLs', () => {
      expect(isAuthenticatedImageUrl('https://uploads.linear.app/abc123/image.png')).toBe(true)
    })

    test('returns true for GitHub private-user-images.githubusercontent.com URLs', () => {
      expect(isAuthenticatedImageUrl('https://private-user-images.githubusercontent.com/12345/abc.png?jwt=xyz')).toBe(true)
    })

    test('returns false for public GitHub user-images.githubusercontent.com URLs', () => {
      expect(isAuthenticatedImageUrl('https://user-images.githubusercontent.com/12345/abc.png')).toBe(false)
    })

    test('returns false for other domains', () => {
      expect(isAuthenticatedImageUrl('https://example.com/image.png')).toBe(false)
      expect(isAuthenticatedImageUrl('https://imgur.com/abc.jpg')).toBe(false)
      expect(isAuthenticatedImageUrl('https://cdn.example.com/image.webp')).toBe(false)
    })

    test('handles URLs with various paths', () => {
      expect(isAuthenticatedImageUrl('https://uploads.linear.app/deep/nested/path/image.png')).toBe(true)
      expect(isAuthenticatedImageUrl('https://private-user-images.githubusercontent.com/a/b/c.png')).toBe(true)
    })
  })

  describe('getCacheKey', () => {
    test('generates consistent hash for same URL', () => {
      const url = 'https://uploads.linear.app/abc123/image.png'
      const key1 = getCacheKey(url)
      const key2 = getCacheKey(url)

      expect(key1).toBe(key2)
    })

    test('GitHub URLs: strips JWT query params before hashing', () => {
      const url1 = 'https://private-user-images.githubusercontent.com/12345/abc.png?jwt=token1'
      const url2 = 'https://private-user-images.githubusercontent.com/12345/abc.png?jwt=token2'

      const key1 = getCacheKey(url1)
      const key2 = getCacheKey(url2)

      // Same base URL should produce same cache key regardless of JWT
      expect(key1).toBe(key2)
    })

    test('Linear URLs: uses full URL for hash', () => {
      const url1 = 'https://uploads.linear.app/abc123/image1.png'
      const url2 = 'https://uploads.linear.app/abc123/image2.png'

      const key1 = getCacheKey(url1)
      const key2 = getCacheKey(url2)

      expect(key1).not.toBe(key2)
    })

    test('preserves file extension in cache key', () => {
      const pngUrl = 'https://uploads.linear.app/abc/image.png'
      const jpgUrl = 'https://uploads.linear.app/abc/image.jpg'

      const pngKey = getCacheKey(pngUrl)
      const jpgKey = getCacheKey(jpgUrl)

      expect(pngKey).toMatch(/\.png$/)
      expect(jpgKey).toMatch(/\.jpg$/)
    })

    test('handles URLs without extension', () => {
      const url = 'https://uploads.linear.app/abc123/image'
      const key = getCacheKey(url)

      // Should default to .png if no extension found
      expect(key).toMatch(/\.png$/)
    })

    test('handles various image extensions', () => {
      const extensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']

      extensions.forEach(ext => {
        const url = `https://uploads.linear.app/abc/image${ext}`
        const key = getCacheKey(url)
        expect(key).toMatch(new RegExp(`\\${ext}$`))
      })
    })
  })

  describe('getCachedImagePath', () => {
    const testCacheDir = join(tmpdir(), 'iloom-images-test-cache')

    beforeEach(() => {
      // Clean up test cache directory
      if (existsSync(testCacheDir)) {
        rmSync(testCacheDir, { recursive: true })
      }
    })

    test('returns path when cached file exists', () => {
      // Create the cache directory and a fake cached file
      mkdirSync(CACHE_DIR, { recursive: true })
      const url = 'https://uploads.linear.app/test-cached/image.png'
      const cacheKey = getCacheKey(url)
      const cachedPath = join(CACHE_DIR, cacheKey)

      writeFileSync(cachedPath, 'fake image data')

      const result = getCachedImagePath(url)
      expect(result).toBe(cachedPath)

      // Clean up
      rmSync(cachedPath)
    })

    test('returns undefined when no cached file', () => {
      const url = 'https://uploads.linear.app/nonexistent/image.png'
      const result = getCachedImagePath(url)

      expect(result).toBeUndefined()
    })
  })

  describe('downloadAndSaveImage', () => {
    // Helper to create a mock ReadableStream from data chunks
    function createMockReadableStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
      let chunkIndex = 0
      return {
        getReader: () => ({
          read: async () => {
            if (chunkIndex >= chunks.length) {
              return { done: true, value: undefined }
            }
            const value = chunks[chunkIndex++]
            return { done: false, value }
          },
          cancel: vi.fn()
        })
      } as unknown as ReadableStream<Uint8Array>
    }

    test('downloads and saves image successfully without auth', async () => {
      const imageData = new Uint8Array([0x89, 0x50, 0x4E, 0x47]) // PNG magic bytes
      const mockStream = createMockReadableStream([imageData])

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['Content-Length', String(imageData.length)]]),
        body: mockStream
      })

      const destPath = join(CACHE_DIR, 'test-download-no-auth.png')
      await downloadAndSaveImage('https://example.com/image.png', destPath)

      expect(existsSync(destPath)).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith('https://example.com/image.png', expect.objectContaining({
        headers: {}
      }))

      // Clean up
      rmSync(destPath)
    })

    test('downloads image with Authorization header for Linear', async () => {
      const imageData = new Uint8Array([0x89, 0x50, 0x4E, 0x47])
      const mockStream = createMockReadableStream([imageData])

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['Content-Length', String(imageData.length)]]),
        body: mockStream
      })

      const destPath = join(CACHE_DIR, 'test-download-auth.png')
      await downloadAndSaveImage('https://uploads.linear.app/image.png', destPath, 'Bearer token123')

      expect(mockFetch).toHaveBeenCalledWith('https://uploads.linear.app/image.png', expect.objectContaining({
        headers: { Authorization: 'Bearer token123' }
      }))

      // Clean up
      if (existsSync(destPath)) rmSync(destPath)
    })

    test('throws error for network failures', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const destPath = join(CACHE_DIR, 'test-network-fail.png')
      await expect(downloadAndSaveImage('https://example.com/image.png', destPath))
        .rejects.toThrow('Network error')
    })

    test('throws error for non-200 responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      })

      const destPath = join(CACHE_DIR, 'test-404.png')
      await expect(downloadAndSaveImage('https://example.com/image.png', destPath))
        .rejects.toThrow('Failed to download image: 404 Not Found')
    })

    test('throws error when Content-Length exceeds limit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['Content-Length', String(15 * 1024 * 1024)]]) // 15MB
      })

      const destPath = join(CACHE_DIR, 'test-large.png')
      await expect(downloadAndSaveImage('https://example.com/large.png', destPath))
        .rejects.toThrow(/Image too large.*exceeds.*limit/)
    })

    test('throws error when streamed data exceeds limit', async () => {
      // Create chunks that together exceed the limit
      const chunkSize = 2 * 1024 * 1024 // 2MB per chunk
      const chunks: Uint8Array[] = []
      for (let i = 0; i < 6; i++) { // 12MB total
        chunks.push(new Uint8Array(chunkSize))
      }
      const mockStream = createMockReadableStream(chunks)

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map(), // No Content-Length
        body: mockStream
      })

      const destPath = join(CACHE_DIR, 'test-stream-large.png')
      await expect(downloadAndSaveImage('https://example.com/large.png', destPath))
        .rejects.toThrow(/Image too large.*exceeds.*limit/)

      // Clean up partial file if it exists
      if (existsSync(destPath)) rmSync(destPath)
    })

    test('handles timeout via AbortError', async () => {
      const abortError = new Error('The operation was aborted')
      abortError.name = 'AbortError'
      mockFetch.mockRejectedValueOnce(abortError)

      const destPath = join(CACHE_DIR, 'test-timeout.png')
      await expect(downloadAndSaveImage('https://example.com/slow.png', destPath))
        .rejects.toThrow(/timed out/)
    })

    test('throws error when response body is null', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['Content-Length', '100']]),
        body: null
      })

      const destPath = join(CACHE_DIR, 'test-null-body.png')
      await expect(downloadAndSaveImage('https://example.com/image.png', destPath))
        .rejects.toThrow('Response body is null')
    })
  })

  describe('getCacheDestPath', () => {
    test('returns path in cache directory with URL-based filename', () => {
      const url = 'https://uploads.linear.app/test/image.png'
      const destPath = getCacheDestPath(url)

      expect(destPath).toContain('iloom-images')
      expect(destPath).toMatch(/\.png$/)
    })

    test('creates cache directory if needed', () => {
      const url = 'https://uploads.linear.app/dirtest/image.jpg'
      const destPath = getCacheDestPath(url)

      expect(existsSync(CACHE_DIR)).toBe(true)
      expect(destPath.startsWith(CACHE_DIR)).toBe(true)
    })
  })


  describe('rewriteMarkdownUrls', () => {
    test('replaces single URL in markdown syntax', () => {
      const content = '![screenshot](https://example.com/image.png)'
      const urlMap = new Map([
        ['https://example.com/image.png', '/tmp/local-image.png']
      ])

      const result = rewriteMarkdownUrls(content, urlMap)

      expect(result).toBe('![screenshot](/tmp/local-image.png)')
    })

    test('replaces multiple URLs', () => {
      const content = `
![first](https://example.com/first.png)
Some text
![second](https://example.com/second.png)
      `.trim()

      const urlMap = new Map([
        ['https://example.com/first.png', '/tmp/first-local.png'],
        ['https://example.com/second.png', '/tmp/second-local.png']
      ])

      const result = rewriteMarkdownUrls(content, urlMap)

      expect(result).toContain('![first](/tmp/first-local.png)')
      expect(result).toContain('![second](/tmp/second-local.png)')
    })

    test('does not replace URL when not in map', () => {
      const content = '![image](https://example.com/image.png)'
      const urlMap = new Map<string, string>()

      const result = rewriteMarkdownUrls(content, urlMap)

      expect(result).toBe(content)
    })

    test('replaces URLs in HTML img src', () => {
      const content = '<img src="https://example.com/image.png">'
      const urlMap = new Map([
        ['https://example.com/image.png', '/tmp/local.png']
      ])

      const result = rewriteMarkdownUrls(content, urlMap)

      expect(result).toBe('<img src="/tmp/local.png">')
    })

    test('handles mixed markdown and HTML images', () => {
      const content = `
![md](https://example.com/md.png)
<img src="https://example.com/html.png">
      `.trim()

      const urlMap = new Map([
        ['https://example.com/md.png', '/tmp/md-local.png'],
        ['https://example.com/html.png', '/tmp/html-local.png']
      ])

      const result = rewriteMarkdownUrls(content, urlMap)

      expect(result).toContain('![md](/tmp/md-local.png)')
      expect(result).toContain('<img src="/tmp/html-local.png">')
    })
  })

  describe('processMarkdownImages', () => {
    // Helper to create a mock ReadableStream from data chunks
    function createMockReadableStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
      let chunkIndex = 0
      return {
        getReader: () => ({
          read: async () => {
            if (chunkIndex >= chunks.length) {
              return { done: true, value: undefined }
            }
            const value = chunks[chunkIndex++]
            return { done: false, value }
          },
          cancel: vi.fn()
        })
      } as unknown as ReadableStream<Uint8Array>
    }

    test('returns empty string for empty content', async () => {
      const result = await processMarkdownImages('', 'github')
      expect(result).toBe('')
    })

    test('returns original content when no images', async () => {
      const content = 'Just some text without any images'
      const result = await processMarkdownImages(content, 'github')
      expect(result).toBe(content)
    })

    test('returns original content when images are public (not authenticated)', async () => {
      const content = '![public](https://example.com/public-image.png)'
      const result = await processMarkdownImages(content, 'github')
      expect(result).toBe(content)
    })

    test('downloads and rewrites GitHub private images', async () => {
      const content = '![screenshot](https://private-user-images.githubusercontent.com/123/abc.png?jwt=token)'

      // Mock gh auth token
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: 'ghp_testtoken',
        stderr: '',
        exitCode: 0
      } as never)

      // Mock successful image download with streaming
      const imageData = new Uint8Array([0x89, 0x50, 0x4E, 0x47]) // PNG magic bytes
      const mockStream = createMockReadableStream([imageData])
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['Content-Length', String(imageData.length)]]),
        body: mockStream
      })

      const result = await processMarkdownImages(content, 'github')

      // Should contain local file path instead of remote URL
      expect(result).not.toContain('private-user-images.githubusercontent.com')
      expect(result).toContain('iloom-images')
    })

    test('downloads and rewrites Linear images', async () => {
      const originalToken = process.env.LINEAR_API_TOKEN
      process.env.LINEAR_API_TOKEN = 'lin_test_token'

      try {
        const content = '![diagram](https://uploads.linear.app/abc123/diagram.png)'

        // Mock successful image download with streaming
        const imageData = new Uint8Array([0x89, 0x50, 0x4E, 0x47])
        const mockStream = createMockReadableStream([imageData])
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map([['Content-Length', String(imageData.length)]]),
          body: mockStream
        })

        const result = await processMarkdownImages(content, 'linear')

        // Should contain local file path instead of remote URL
        expect(result).not.toContain('uploads.linear.app')
        expect(result).toContain('iloom-images')
      } finally {
        if (originalToken) {
          process.env.LINEAR_API_TOKEN = originalToken
        } else {
          delete process.env.LINEAR_API_TOKEN
        }
      }
    })

    test('uses cached image path when file exists', async () => {
      // Create a cached file
      mkdirSync(CACHE_DIR, { recursive: true })
      const url = 'https://uploads.linear.app/cached-test/image.png'
      const cacheKey = getCacheKey(url)
      const cachedPath = join(CACHE_DIR, cacheKey)
      writeFileSync(cachedPath, 'cached data')

      const originalToken = process.env.LINEAR_API_TOKEN
      process.env.LINEAR_API_TOKEN = 'lin_test_token'

      try {
        const content = `![cached](${url})`

        const result = await processMarkdownImages(content, 'linear')

        // Should use cached path without downloading
        expect(mockFetch).not.toHaveBeenCalled()
        expect(result).toContain(cachedPath)
      } finally {
        if (originalToken) {
          process.env.LINEAR_API_TOKEN = originalToken
        } else {
          delete process.env.LINEAR_API_TOKEN
        }
        rmSync(cachedPath)
      }
    })

    test('handles mixed public and private images', async () => {
      const originalToken = process.env.LINEAR_API_TOKEN
      process.env.LINEAR_API_TOKEN = 'lin_test_token'

      try {
        const content = `
![public](https://example.com/public.png)
![private](https://uploads.linear.app/abc/private.png)
        `.trim()

        // Mock successful image download for the private image with streaming
        const imageData = new Uint8Array([0x89, 0x50, 0x4E, 0x47])
        const mockStream = createMockReadableStream([imageData])
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map([['Content-Length', String(imageData.length)]]),
          body: mockStream
        })

        const result = await processMarkdownImages(content, 'linear')

        // Public image should remain unchanged
        expect(result).toContain('https://example.com/public.png')
        // Private image should be replaced
        expect(result).not.toContain('uploads.linear.app')
      } finally {
        if (originalToken) {
          process.env.LINEAR_API_TOKEN = originalToken
        } else {
          delete process.env.LINEAR_API_TOKEN
        }
      }
    })

    test('gracefully handles download failure - preserves original URL', async () => {
      const originalToken = process.env.LINEAR_API_TOKEN
      process.env.LINEAR_API_TOKEN = 'lin_test_token'

      try {
        const content = '![failing](https://uploads.linear.app/fail/image.png)'

        // Mock failed image download
        mockFetch.mockRejectedValueOnce(new Error('Network error'))

        const result = await processMarkdownImages(content, 'linear')

        // Should preserve original URL on failure
        expect(result).toBe(content)
      } finally {
        if (originalToken) {
          process.env.LINEAR_API_TOKEN = originalToken
        } else {
          delete process.env.LINEAR_API_TOKEN
        }
      }
    })

    test('handles multiple images with partial failures', async () => {
      const originalToken = process.env.LINEAR_API_TOKEN
      process.env.LINEAR_API_TOKEN = 'lin_test_token'

      // Use unique URLs with timestamps to ensure no cache hits
      const timestamp = Date.now()
      const firstUrl = `https://uploads.linear.app/first-${timestamp}/success.png`
      const secondUrl = `https://uploads.linear.app/second-${timestamp}/failure.png`

      try {
        const content = `
![first](${firstUrl})
![second](${secondUrl})
        `.trim()

        // First image succeeds with streaming
        const imageData = new Uint8Array([0x89, 0x50, 0x4E, 0x47])
        const mockStream = createMockReadableStream([imageData])
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map([['Content-Length', String(imageData.length)]]),
          body: mockStream
        })
        // Second image fails
        mockFetch.mockRejectedValueOnce(new Error('Network error'))

        const result = await processMarkdownImages(content, 'linear')

        // First should be replaced (local path)
        expect(result).toContain('iloom-images')
        // Second should preserve original URL
        expect(result).toContain(secondUrl)
      } finally {
        if (originalToken) {
          process.env.LINEAR_API_TOKEN = originalToken
        } else {
          delete process.env.LINEAR_API_TOKEN
        }
      }
    })
  })
})
