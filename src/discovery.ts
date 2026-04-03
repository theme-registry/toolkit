import fs from 'fs'
import path from 'path'
import type { DiscoveredThemePackage, ThemePackageMetadata } from './types.js'

const THEME_KEYWORD = 'theme-registry-theme'

export interface DiscoverThemeOptions {
  cwd?: string
}

export function discoverThemePackages(options: DiscoverThemeOptions = {}): DiscoveredThemePackage[] {
  const cwd = options.cwd ?? process.cwd()
  const nodeModules = path.join(cwd, 'node_modules')
  if (!fs.existsSync(nodeModules)) return []

  const results: DiscoveredThemePackage[] = []

  const visitDir = (dir: string) => {
    if (!fs.existsSync(dir)) return
    const entries = fs.readdirSync(dir)
    for (const entry of entries) {
      if (entry.startsWith('.')) continue
      const fullPath = path.join(dir, entry)
      try {
        const stat = fs.lstatSync(fullPath)
        if (stat.isDirectory()) {
          if (entry.startsWith('@')) {
            visitDir(fullPath)
          } else if (fs.existsSync(path.join(fullPath, 'package.json'))) {
            const pkg = readThemePackage(fullPath)
            if (pkg) results.push(pkg)
          }
        }
      } catch (err) {
        // ignore errors from inaccessible entries
      }
    }
  }

  visitDir(nodeModules)
  return results
}

function readThemePackage(packageDir: string): DiscoveredThemePackage | null {
  const manifestPath = path.join(packageDir, 'package.json')
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    const metadata = normalizeThemeMetadata(manifest.themeRegistry)
    const isKeyworded = Array.isArray(manifest.keywords) && manifest.keywords.includes(THEME_KEYWORD)

    if (!metadata && !isKeyworded) {
      return null
    }

    const registryPath = metadata?.registry
      ? path.resolve(packageDir, metadata.registry)
      : undefined
    const templatesPath = metadata?.templates
      ? path.resolve(packageDir, metadata.templates)
      : undefined

    return {
      name: manifest.name ?? packageDir,
      version: manifest.version,
      packageDir,
      registryPath,
      templatesPath,
      metadata
    }
  } catch (err) {
    return null
  }
}

function normalizeThemeMetadata(value: unknown): ThemePackageMetadata | undefined {
  if (!value || typeof value !== 'object') return undefined
  const registry = (value as any).registry
  const templates = (value as any).templates
  if (typeof registry !== 'string' || typeof templates !== 'string') return undefined
  return { registry, templates }
}
