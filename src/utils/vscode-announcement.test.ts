import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import { showVSCodeAnnouncementIfNeeded } from './vscode-announcement.js'
import { FirstRunManager } from './FirstRunManager.js'

// Mock FirstRunManager
vi.mock('./FirstRunManager.js')

describe('showVSCodeAnnouncementIfNeeded', () => {
  let mockIsFirstRun: Mock
  let mockMarkAsRun: Mock
  let originalIsTTY: boolean | undefined

  beforeEach(() => {
    // Save original isTTY value
    originalIsTTY = process.stdout.isTTY

    // Setup FirstRunManager mock
    mockIsFirstRun = vi.fn()
    mockMarkAsRun = vi.fn()
    vi.mocked(FirstRunManager).mockImplementation(() => ({
      isFirstRun: mockIsFirstRun,
      markAsRun: mockMarkAsRun,
      isProjectConfigured: vi.fn(),
      markProjectAsConfigured: vi.fn(),
    }) as unknown as FirstRunManager)

    // Spy on console.log
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    // Restore original isTTY
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY,
      writable: true,
      configurable: true,
    })
  })

  it('shows announcement on first run in TTY', async () => {
    // Set TTY mode
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    })

    mockIsFirstRun.mockResolvedValue(true)
    mockMarkAsRun.mockResolvedValue(undefined)

    await showVSCodeAnnouncementIfNeeded('start')

    // Should display announcement (console.log called multiple times for box)
    expect(console.log).toHaveBeenCalled()
    // Should mark as run
    expect(mockMarkAsRun).toHaveBeenCalled()
  })

  it('does not show on subsequent runs', async () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    })

    // Not first run
    mockIsFirstRun.mockResolvedValue(false)

    await showVSCodeAnnouncementIfNeeded('start')

    // Should not display announcement
    expect(console.log).not.toHaveBeenCalled()
    // Should not mark as run
    expect(mockMarkAsRun).not.toHaveBeenCalled()
  })

  it('does not show in non-TTY environment', async () => {
    // Set non-TTY mode
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      writable: true,
      configurable: true,
    })

    mockIsFirstRun.mockResolvedValue(true)

    await showVSCodeAnnouncementIfNeeded('start')

    // Should not even check first run (early return)
    expect(mockIsFirstRun).not.toHaveBeenCalled()
    // Should not display announcement
    expect(console.log).not.toHaveBeenCalled()
  })

  it('does not show when command is vscode', async () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    })

    mockIsFirstRun.mockResolvedValue(true)

    await showVSCodeAnnouncementIfNeeded('vscode')

    // Should not even check first run (early return for vscode command)
    expect(mockIsFirstRun).not.toHaveBeenCalled()
    // Should not display announcement
    expect(console.log).not.toHaveBeenCalled()
  })

  it('marks announcement as shown after display', async () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    })

    mockIsFirstRun.mockResolvedValue(true)
    mockMarkAsRun.mockResolvedValue(undefined)

    await showVSCodeAnnouncementIfNeeded('finish')

    // Verify markAsRun was called
    expect(mockMarkAsRun).toHaveBeenCalledTimes(1)
  })

  it('creates FirstRunManager with correct feature name', async () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    })

    mockIsFirstRun.mockResolvedValue(false)

    await showVSCodeAnnouncementIfNeeded('list')

    // Verify FirstRunManager was instantiated with 'vscode-announcement'
    expect(FirstRunManager).toHaveBeenCalledWith('vscode-announcement')
  })
})
