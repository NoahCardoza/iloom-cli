import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs-extra'
import {
  readPackageJson,
  parseBinField,
  hasWebDependencies,
  hasScript,
  readIloomPackageScripts,
  getPackageConfig,
  ILOOM_PACKAGE_PATH
} from './package-json.js'
import type { PackageJson } from './package-json.js'

vi.mock('fs-extra')
vi.mock('./logger-context.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn()
  })
}))

describe('readPackageJson', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should read and parse package.json successfully', async () => {
    const mockPackageJson: PackageJson = {
      name: 'test-package',
      version: '1.0.0',
      bin: './dist/cli.js',
      scripts: {
        build: 'tsc',
        test: 'vitest'
      }
    }

    vi.mocked(fs.readJson).mockResolvedValueOnce(mockPackageJson)

    const result = await readPackageJson('/test/path')

    expect(fs.readJson).toHaveBeenCalledWith('/test/path/package.json')
    expect(result).toEqual(mockPackageJson)
  })

  it('should throw error if package.json does not exist', async () => {
    vi.mocked(fs.readJson).mockRejectedValueOnce({ code: 'ENOENT' })

    await expect(readPackageJson('/test/path')).rejects.toThrow(
      'package.json not found in /test/path'
    )
  })

  it('should throw error if package.json has invalid JSON', async () => {
    vi.mocked(fs.readJson).mockRejectedValueOnce(
      new Error('Unexpected token } in JSON')
    )

    await expect(readPackageJson('/test/path')).rejects.toThrow(
      'Invalid package.json in /test/path: Unexpected token } in JSON'
    )
  })

  it('should handle package.json without bin field', async () => {
    const mockPackageJson: PackageJson = {
      name: 'web-app',
      version: '1.0.0',
      dependencies: {
        next: '^14.0.0'
      }
    }

    vi.mocked(fs.readJson).mockResolvedValueOnce(mockPackageJson)

    const result = await readPackageJson('/test/path')

    expect(result.bin).toBeUndefined()
    expect(result).toEqual(mockPackageJson)
  })
})

describe('parseBinField', () => {
  it('should parse object bin field with multiple entries', () => {
    const binField = {
      il: './dist/cli.js',
      iloom: './dist/cli.js'
    }

    const result = parseBinField(binField, 'iloom-ai')

    expect(result).toEqual({
      il: './dist/cli.js',
      iloom: './dist/cli.js'
    })
  })

  it('should parse string bin field and use package name', () => {
    const binField = './dist/cli.js'

    const result = parseBinField(binField, 'my-cli-tool')

    expect(result).toEqual({
      'my-cli-tool': './dist/cli.js'
    })
  })

  it('should return empty object for undefined bin field', () => {
    const result = parseBinField(undefined, 'some-package')

    expect(result).toEqual({})
  })

  it('should handle bin field pointing to non-existent files', () => {
    // parseBinField just parses the structure, doesn't verify files exist
    const binField = './non-existent.js'

    const result = parseBinField(binField, 'test-pkg')

    expect(result).toEqual({
      'test-pkg': './non-existent.js'
    })
  })
})

describe('hasWebDependencies', () => {
  it('should detect Next.js in dependencies', () => {
    const pkgJson: PackageJson = {
      name: 'web-app',
      dependencies: {
        next: '^14.0.0',
        react: '^18.0.0'
      }
    }

    expect(hasWebDependencies(pkgJson)).toBe(true)
  })

  it('should detect Vite in devDependencies', () => {
    const pkgJson: PackageJson = {
      name: 'vite-app',
      devDependencies: {
        vite: '^5.0.0'
      }
    }

    expect(hasWebDependencies(pkgJson)).toBe(true)
  })

  it('should detect Express, Fastify, Koa in dependencies', () => {
    const expressApp: PackageJson = {
      name: 'express-app',
      dependencies: {
        express: '^4.18.0'
      }
    }

    const fastifyApp: PackageJson = {
      name: 'fastify-app',
      dependencies: {
        fastify: '^4.0.0'
      }
    }

    const koaApp: PackageJson = {
      name: 'koa-app',
      dependencies: {
        koa: '^2.14.0'
      }
    }

    expect(hasWebDependencies(expressApp)).toBe(true)
    expect(hasWebDependencies(fastifyApp)).toBe(true)
    expect(hasWebDependencies(koaApp)).toBe(true)
  })

  it('should detect Svelte, Nuxt, Remix, Astro', () => {
    const svelteApp: PackageJson = {
      name: 'svelte-app',
      devDependencies: {
        'svelte-kit': '^2.0.0'
      }
    }

    const nuxtApp: PackageJson = {
      name: 'nuxt-app',
      dependencies: {
        nuxt: '^3.0.0'
      }
    }

    const remixApp: PackageJson = {
      name: 'remix-app',
      dependencies: {
        remix: '^2.0.0'
      }
    }

    const astroApp: PackageJson = {
      name: 'astro-app',
      devDependencies: {
        astro: '^4.0.0'
      }
    }

    expect(hasWebDependencies(svelteApp)).toBe(true)
    expect(hasWebDependencies(nuxtApp)).toBe(true)
    expect(hasWebDependencies(remixApp)).toBe(true)
    expect(hasWebDependencies(astroApp)).toBe(true)
  })

  it('should return false for CLI-only projects', () => {
    const cliApp: PackageJson = {
      name: 'cli-tool',
      bin: './dist/cli.js',
      dependencies: {
        commander: '^11.0.0',
        chalk: '^5.0.0'
      }
    }

    expect(hasWebDependencies(cliApp)).toBe(false)
  })

  it('should check both dependencies and devDependencies', () => {
    const mixedApp: PackageJson = {
      name: 'mixed-app',
      dependencies: {
        lodash: '^4.17.21'
      },
      devDependencies: {
        vite: '^5.0.0'
      }
    }

    expect(hasWebDependencies(mixedApp)).toBe(true)
  })
})

describe('hasScript', () => {
  it('should return true when script exists', () => {
    const pkgJson: PackageJson = {
      name: 'test-pkg',
      scripts: {
        build: 'tsc',
        test: 'vitest',
        dev: 'tsup --watch'
      }
    }

    expect(hasScript(pkgJson, 'build')).toBe(true)
    expect(hasScript(pkgJson, 'test')).toBe(true)
    expect(hasScript(pkgJson, 'dev')).toBe(true)
  })

  it('should return false when script does not exist', () => {
    const pkgJson: PackageJson = {
      name: 'test-pkg',
      scripts: {
        build: 'tsc'
      }
    }

    expect(hasScript(pkgJson, 'deploy')).toBe(false)
    expect(hasScript(pkgJson, 'unknown')).toBe(false)
  })

  it('should return false when scripts field is undefined', () => {
    const pkgJson: PackageJson = {
      name: 'test-pkg'
    }

    expect(hasScript(pkgJson, 'build')).toBe(false)
  })

  it('should return false when scripts field is empty object', () => {
    const pkgJson: PackageJson = {
      name: 'test-pkg',
      scripts: {}
    }

    expect(hasScript(pkgJson, 'build')).toBe(false)
  })
})

describe('ILOOM_PACKAGE_PATH', () => {
  it('should have correct path value', () => {
    expect(ILOOM_PACKAGE_PATH).toBe('.iloom/package.iloom.json')
  })
})

describe('readIloomPackageScripts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return null when package.iloom.json does not exist', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(false)

    const result = await readIloomPackageScripts('/test/path')

    expect(result).toBeNull()
    expect(fs.pathExists).toHaveBeenCalledWith('/test/path/.iloom/package.iloom.json')
  })

  it('should read and return scripts from package.iloom.json when it exists', async () => {
    const mockIloomPackage = {
      name: 'my-rust-project',
      scripts: {
        build: 'cargo build',
        test: 'cargo test',
        dev: 'cargo run',
      },
    }
    vi.mocked(fs.pathExists).mockResolvedValue(true)
    vi.mocked(fs.readJson).mockResolvedValue(mockIloomPackage)

    const result = await readIloomPackageScripts('/test/path')

    expect(result).toEqual(mockIloomPackage)
    expect(fs.readJson).toHaveBeenCalledWith('/test/path/.iloom/package.iloom.json')
  })

  it('should return null and log warning when package.iloom.json contains invalid JSON', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true)
    vi.mocked(fs.readJson).mockRejectedValue(new Error('Invalid JSON'))

    const result = await readIloomPackageScripts('/test/path')

    expect(result).toBeNull()
  })
})

describe('getPackageConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return package.json when package.iloom.json does not exist', async () => {
    const mockPackageJson = {
      name: 'my-node-project',
      version: '1.0.0',
      bin: './dist/cli.js',
      scripts: {
        build: 'tsc',
        test: 'vitest',
      },
    }
    vi.mocked(fs.pathExists).mockResolvedValue(false)
    vi.mocked(fs.readJson).mockResolvedValue(mockPackageJson)

    const result = await getPackageConfig('/test/path')

    expect(result).toEqual(mockPackageJson)
  })

  it('should merge scripts when both files exist', async () => {
    const mockPackageJson = {
      name: 'my-node-project',
      version: '1.0.0',
      bin: './dist/cli.js',
      dependencies: { commander: '^11.0.0' },
      scripts: {
        build: 'tsc',
        test: 'vitest',
        lint: 'eslint .',
      },
    }
    const mockIloomPackage = {
      name: 'custom',
      scripts: {
        test: 'pytest',  // Override test script
        dev: 'python -m myapp',  // Add new script
      },
    }

    // First call: pathExists for package.iloom.json
    vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
    // First readJson: package.iloom.json
    vi.mocked(fs.readJson).mockResolvedValueOnce(mockIloomPackage)
    // Second readJson: package.json
    vi.mocked(fs.readJson).mockResolvedValueOnce(mockPackageJson)

    const result = await getPackageConfig('/test/path')

    // Should have all package.json fields
    expect(result.name).toBe('my-node-project')
    expect(result.version).toBe('1.0.0')
    expect(result.bin).toBe('./dist/cli.js')
    expect(result.dependencies).toEqual({ commander: '^11.0.0' })

    // Scripts should be merged with iloom taking precedence
    expect(result.scripts).toEqual({
      build: 'tsc',       // From package.json
      test: 'pytest',     // Overridden by iloom
      lint: 'eslint .',   // From package.json
      dev: 'python -m myapp',  // Added by iloom
    })
  })

  it('should preserve all package.json fields when merging', async () => {
    const mockPackageJson = {
      name: 'my-cli',
      version: '2.0.0',
      bin: { 'my-cli': './dist/index.js' },
      dependencies: { lodash: '^4.17.21' },
      devDependencies: { typescript: '^5.0.0' },
      scripts: { build: 'tsc' },
    }
    const mockIloomPackage = {
      name: 'ignored',
      scripts: { test: 'cargo test' },
    }

    vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
    vi.mocked(fs.readJson)
      .mockResolvedValueOnce(mockIloomPackage)
      .mockResolvedValueOnce(mockPackageJson)

    const result = await getPackageConfig('/test/path')

    expect(result.name).toBe('my-cli')
    expect(result.version).toBe('2.0.0')
    expect(result.bin).toEqual({ 'my-cli': './dist/index.js' })
    expect(result.dependencies).toEqual({ lodash: '^4.17.21' })
    expect(result.devDependencies).toEqual({ typescript: '^5.0.0' })
    expect(result.scripts).toEqual({
      build: 'tsc',
      test: 'cargo test',
    })
  })

  it('should use only package.iloom.json when package.json does not exist', async () => {
    const mockIloomPackage = {
      name: 'my-rust-project',
      scripts: {
        build: 'cargo build',
        test: 'cargo test',
      },
    }

    vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
    vi.mocked(fs.readJson)
      .mockResolvedValueOnce(mockIloomPackage)
      .mockRejectedValueOnce({ code: 'ENOENT' })

    const result = await getPackageConfig('/test/path')

    expect(result).toEqual(mockIloomPackage)
  })

  it('should throw when neither file exists', async () => {
    vi.mocked(fs.pathExists).mockResolvedValueOnce(false)
    vi.mocked(fs.readJson).mockRejectedValueOnce({ code: 'ENOENT' })

    await expect(getPackageConfig('/test/path')).rejects.toThrow(
      'package.json not found in /test/path'
    )
  })

  it('should fall back to package.json when package.iloom.json is malformed', async () => {
    const mockPackageJson = {
      name: 'my-node-project',
      scripts: { build: 'tsc' },
    }

    vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
    vi.mocked(fs.readJson)
      .mockRejectedValueOnce(new Error('Invalid JSON'))
      .mockResolvedValueOnce(mockPackageJson)

    const result = await getPackageConfig('/test/path')

    expect(result).toEqual(mockPackageJson)
  })
})
