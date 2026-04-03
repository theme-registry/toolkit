import fs from 'fs'
import path from 'path'
import { discoverThemePackages } from './discovery.js'
import type { ResolvedConfig } from './types.js'

export interface GenerateCatalogOptions {
  resolvedConfig: ResolvedConfig
  packagesDir?: string
  outputPath?: string
}

interface ThemeEntry {
  name: string
  importPath: string
}

export function generateThemeCatalog(options: GenerateCatalogOptions): string {
  const local = discoverLocalThemes(options.resolvedConfig)
  const pkgThemes = discoverThemePackages({ cwd: options.packagesDir ?? process.cwd() })

  const entries: ThemeEntry[] = []

  local.forEach(theme => {
    const outputDir = path.dirname(options.outputPath ?? path.join(options.resolvedConfig.themesDir, 'theme-catalog.js'))
    const registryRelative = path.relative(outputDir, theme.registryPath).replace(/\\/g, '/')
    const normalizedPath = registryRelative.startsWith('.') ? registryRelative : `./${registryRelative}`
    entries.push({ name: theme.name, importPath: normalizedPath })
  })

  pkgThemes.forEach(theme => {
    if (!theme.registryPath) return
    entries.push({ name: theme.name, importPath: theme.registryPath })
  })

  const lines: string[] = []
  lines.push('// Auto-generated theme catalog. Do not edit manually.')
  lines.push('import Registry from "@4i4/registry";')
  lines.push('const themeCatalog = new Registry();')
  lines.push('')
  entries.forEach(entry => {
    lines.push(`themeCatalog.set("${entry.name}", () => import("${entry.importPath}"));`)
  })
  lines.push('')
  lines.push('export default themeCatalog;')
  lines.push('')
  lines.push('export async function loadTheme(name) {')
  lines.push('  const loader = themeCatalog.get(name)')
  lines.push('  if (!loader) {')
  lines.push('    throw new Error(`Theme ${name} is not registered in the catalog`)')
  lines.push('  }')
  lines.push('  const module = await loader()')
  lines.push('  return module.default ?? module')
  lines.push('}')

  const outputPath = options.outputPath ?? path.join(options.resolvedConfig.themesDir, 'theme-catalog.js')
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, lines.join('\n'), { encoding: 'utf8' })
  return outputPath
}

type CatalogLike = Record<string, () => Promise<any>> | { get?: (name: string) => any }

export async function loadThemeFromCatalog(
  catalog: CatalogLike,
  name: string
): Promise<any> {
  const loader = typeof catalog === 'object' && typeof (catalog as any).get === 'function'
    ? (catalog as any).get(name)
    : (catalog as Record<string, () => Promise<any>>)[name]
  if (!loader) {
    throw new Error(`Theme ${name} is not registered in the catalog`)
  }
  const module = await loader()
  return module?.default ?? module
}

function discoverLocalThemes(resolved: ResolvedConfig): Array<{ name: string, registryPath: string }> {
  const themes: Array<{ name: string, registryPath: string }> = []
  const entries = fs.readdirSync(resolved.themesDir)
  for (const entry of entries) {
    const root = path.join(resolved.themesDir, entry)
    try {
      if (!fs.lstatSync(root).isDirectory()) continue
      const registry = resolveRegistryForTheme(root)
      if (registry) {
        themes.push({ name: entry, registryPath: registry })
      }
    } catch (err) {
      continue
    }
  }
  return themes
}

function resolveRegistryForTheme(themeRoot: string): string | null {
  const file = path.join(themeRoot, 'registry.js')
  if (fs.existsSync(file)) {
    return file
  }
  const dir = path.join(themeRoot, 'registry/index.js')
  if (fs.existsSync(dir)) {
    return dir
  }
  return null
}
