import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFile } from 'fs/promises'
import path from 'path'
import { loadPromptExtensions, __resetTelemetryFiredForTests } from './PromptExtensions.js'
import { TelemetryService } from './TelemetryService.js'

vi.mock('fs/promises', () => ({
	readFile: vi.fn(),
}))

vi.mock('../utils/logger.js', () => ({
	logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockTrack = vi.fn()

vi.mock('./TelemetryService.js', () => ({
	TelemetryService: {
		getInstance: vi.fn(() => ({
			track: mockTrack,
		})),
	},
}))

const REPO_ROOT = '/fake/repo/root'
const ILOOM_MD_PATH = path.join(REPO_ROOT, 'ILOOM.md')

function makeEnoent(): NodeJS.ErrnoException {
	const err: NodeJS.ErrnoException = Object.assign(new Error('ENOENT: no such file'), {
		code: 'ENOENT',
	})
	return err
}

function makePermissionError(): NodeJS.ErrnoException {
	const err: NodeJS.ErrnoException = Object.assign(new Error('EACCES: permission denied'), {
		code: 'EACCES',
	})
	return err
}

describe('loadPromptExtensions', () => {
	beforeEach(() => {
		__resetTelemetryFiredForTests()
		mockTrack.mockReset()
	})

	it('returns trimmed content and fires telemetry (present: true) when file exists with content', async () => {
		const raw = '# Project Conventions\n\nUse tabs.\n\n   \n'
		vi.mocked(readFile).mockResolvedValueOnce(raw)

		const result = await loadPromptExtensions(REPO_ROOT)

		expect(result).toEqual({ iloomMd: '# Project Conventions\n\nUse tabs.' })
		expect(readFile).toHaveBeenCalledWith(ILOOM_MD_PATH, 'utf-8')
		expect(mockTrack).toHaveBeenCalledTimes(1)
		expect(mockTrack).toHaveBeenCalledWith('iloom_md.loaded', {
			present: true,
			size_bucket: 'small',
		})
	})

	it('bucketizes medium files correctly (1024–10239 bytes)', async () => {
		const raw = 'a'.repeat(2048)
		vi.mocked(readFile).mockResolvedValueOnce(raw)

		await loadPromptExtensions(REPO_ROOT)

		expect(mockTrack).toHaveBeenCalledWith('iloom_md.loaded', {
			present: true,
			size_bucket: 'medium',
		})
	})

	it('bucketizes large files correctly (>=10240 bytes)', async () => {
		const raw = 'a'.repeat(20000)
		vi.mocked(readFile).mockResolvedValueOnce(raw)

		await loadPromptExtensions(REPO_ROOT)

		expect(mockTrack).toHaveBeenCalledWith('iloom_md.loaded', {
			present: true,
			size_bucket: 'large',
		})
	})

	it('returns empty string and fires telemetry (present: false, empty) when file is absent (ENOENT)', async () => {
		vi.mocked(readFile).mockRejectedValueOnce(makeEnoent())

		const result = await loadPromptExtensions(REPO_ROOT)

		expect(result).toEqual({ iloomMd: '' })
		expect(mockTrack).toHaveBeenCalledTimes(1)
		expect(mockTrack).toHaveBeenCalledWith('iloom_md.loaded', {
			present: false,
			size_bucket: 'empty',
		})
	})

	it('returns empty string and reports present: true with empty bucket when file is empty', async () => {
		vi.mocked(readFile).mockResolvedValueOnce('')

		const result = await loadPromptExtensions(REPO_ROOT)

		expect(result).toEqual({ iloomMd: '' })
		expect(mockTrack).toHaveBeenCalledWith('iloom_md.loaded', {
			present: true,
			size_bucket: 'empty',
		})
	})

	it('returns empty string gracefully on non-ENOENT read errors (e.g. permissions)', async () => {
		vi.mocked(readFile).mockRejectedValueOnce(makePermissionError())

		const result = await loadPromptExtensions(REPO_ROOT)

		expect(result).toEqual({ iloomMd: '' })
		// Treat unreadable as "not present" for telemetry purposes
		expect(mockTrack).toHaveBeenCalledWith('iloom_md.loaded', {
			present: false,
			size_bucket: 'empty',
		})
	})

	it('fires telemetry exactly once across multiple invocations in the same process', async () => {
		vi.mocked(readFile)
			.mockResolvedValueOnce('first')
			.mockResolvedValueOnce('second')
			.mockRejectedValueOnce(makeEnoent())

		await loadPromptExtensions(REPO_ROOT)
		await loadPromptExtensions(REPO_ROOT)
		await loadPromptExtensions(REPO_ROOT)

		expect(mockTrack).toHaveBeenCalledTimes(1)
	})

	it('does not throw if TelemetryService throws', async () => {
		vi.mocked(readFile).mockResolvedValueOnce('content')
		vi.mocked(TelemetryService.getInstance).mockImplementationOnce(() => {
			throw new Error('telemetry boom')
		})

		await expect(loadPromptExtensions(REPO_ROOT)).resolves.toEqual({
			iloomMd: 'content',
		})
	})

	it('computes size_bucket from raw (pre-trim) byte length', async () => {
		// Content with large trailing whitespace — ensure bucket uses raw byte length
		const content = 'hello' + ' '.repeat(1050)
		vi.mocked(readFile).mockResolvedValueOnce(content)

		const result = await loadPromptExtensions(REPO_ROOT)

		expect(result.iloomMd).toBe('hello')
		// Raw byte length is 1055 -> medium bucket (>=1024), even though trimmed is small
		expect(mockTrack).toHaveBeenCalledWith('iloom_md.loaded', {
			present: true,
			size_bucket: 'medium',
		})
	})
})
