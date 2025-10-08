import fs from 'fs-extra'
import path from 'path'

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
