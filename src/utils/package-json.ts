import fs from 'fs-extra'
import path from 'path'
import { getLogger } from './logger-context.js'

/**
 * Path to the iloom package configuration file (relative to project root)
 * This file allows non-Node.js projects to define scripts for iloom workflows
 */
export const ILOOM_PACKAGE_PATH = '.iloom/package.iloom.json'

export interface PackageJson {
  name: string
  version?: string
  bin?: string | Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  scripts?: Record<string, string>
  [key: string]: unknown
}

/**
 * Read and parse package.json from a directory
 * @param dir Directory containing package.json
 * @returns Parsed package.json object
 * @throws Error if package.json doesn't exist or contains invalid JSON
 */
export async function readPackageJson(dir: string): Promise<PackageJson> {
  const pkgPath = path.join(dir, 'package.json')

  try {
    const pkgJson = await fs.readJson(pkgPath)
    return pkgJson as PackageJson
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') {
      throw new Error(`package.json not found in ${dir}`)
    }
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(`Invalid package.json in ${dir}: ${message}`)
  }
}

/**
 * Read scripts from .iloom/package.iloom.json if it exists
 * This file takes precedence over package.json and contains raw shell commands
 * @param dir Directory containing .iloom/package.iloom.json
 * @returns PackageJson-like object with scripts, or null if file doesn't exist
 */
export async function readIloomPackageScripts(dir: string): Promise<PackageJson | null> {
  const iloomPkgPath = path.join(dir, ILOOM_PACKAGE_PATH)

  try {
    const exists = await fs.pathExists(iloomPkgPath)
    if (!exists) {
      return null
    }

    const content = await fs.readJson(iloomPkgPath)
    return content as PackageJson
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    getLogger().warn(`Failed to read ${ILOOM_PACKAGE_PATH}: ${message}`)
    return null
  }
}

/**
 * Read package configuration for a project, merging .iloom/package.iloom.json scripts over package.json
 * This allows non-Node.js projects to define scripts for iloom workflows while preserving
 * all other package.json fields (name, version, bin, dependencies, etc.)
 *
 * @param dir Directory to read package configuration from
 * @returns PackageJson object with merged scripts (iloom scripts take precedence)
 * @throws Error if neither file exists or contains valid JSON
 */
export async function getPackageConfig(dir: string): Promise<PackageJson> {
  // Check for .iloom/package.iloom.json first
  const iloomPackage = await readIloomPackageScripts(dir)

  if (iloomPackage) {
    // Try to read package.json as base
    try {
      const basePackage = await readPackageJson(dir)
      getLogger().debug('Merging scripts from .iloom/package.iloom.json over package.json')
      // Merge: base package.json with iloom scripts taking precedence
      return {
        ...basePackage,
        scripts: {
          ...basePackage.scripts,
          ...iloomPackage.scripts,
        },
      }
    } catch {
      // No package.json - use iloom package as-is (non-Node project)
      getLogger().debug('Using scripts from .iloom/package.iloom.json (no package.json)')
      return iloomPackage
    }
  }

  // Fall back to package.json only
  return readPackageJson(dir)
}

/**
 * Parse bin field into normalized Record format
 * @param bin The bin field from package.json (string or object)
 * @param packageName Package name to use for string bin variant
 * @returns Normalized bin entries as Record<string, string>
 */
export function parseBinField(
  bin: string | Record<string, string> | undefined,
  packageName: string
): Record<string, string> {
  if (!bin) {
    return {}
  }

  if (typeof bin === 'string') {
    return { [packageName]: bin }
  }

  return bin
}

/**
 * Check if package.json indicates a web application
 * @param pkgJson Parsed package.json object
 * @returns true if package has web framework dependencies
 */
export function hasWebDependencies(pkgJson: PackageJson): boolean {
  const webIndicators = [
    'next',
    'vite',
    'express',
    'react-scripts',
    'nuxt',
    'svelte-kit',
    'astro',
    'remix',
    'fastify',
    'koa',
    'hapi',
    '@angular/core',
    'gatsby',
    '@11ty/eleventy',
    'ember-cli'
  ]

  const allDeps = {
    ...pkgJson.dependencies,
    ...pkgJson.devDependencies
  }

  return webIndicators.some(indicator => indicator in allDeps)
}

/**
 * Check if package.json has a specific script
 * @param pkgJson Parsed package.json object
 * @param scriptName Script name to check for
 * @returns true if script exists
 */
export function hasScript(pkgJson: PackageJson, scriptName: string): boolean {
  return !!pkgJson.scripts?.[scriptName]
}
