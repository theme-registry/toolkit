import fs from 'fs'
import path from 'path'
import { Theme } from './Theme.js'
import { resolveOptions } from './config.js'
import type { PackageThemeOptions, PackageThemeResult } from './types.js'

const IGNORE_NAMES = new Set(['node_modules', '.git', '.DS_Store'])

/**
 * Packages a theme directory into a standalone distributable folder.
 */
export async function packageTheme(options: PackageThemeOptions): Promise<PackageThemeResult> {
  if (!options.theme) {
    throw new Error('theme argument is required when packaging')
  }

  const resolved = await resolveOptions(options)
  const themeIdentifier = options.theme
  const themeRoot = path.isAbsolute(themeIdentifier)
    ? themeIdentifier
    : path.join(resolved.themesDir, themeIdentifier)

  if (!fs.existsSync(themeRoot)) {
    throw new Error(`Theme directory was not found: ${themeIdentifier}`)
  }

  const theme = new Theme(themeRoot, {
    templatesDir: resolved.templatesDir,
    loader: resolved.loader,
    registryModule: resolved.registryModule
  })

  theme.rebuild()

  const baseName = path.basename(themeRoot)
  const outputDir = path.resolve(options.outDir ?? path.join(process.cwd(), 'dist-themes', baseName))

  fs.rmSync(outputDir, { recursive: true, force: true })
  fs.mkdirSync(outputDir, { recursive: true })
  copyThemeContents(themeRoot, outputDir)
  ensurePackageJson(theme, options, outputDir)

  return {
    themeRoot,
    outputDir,
    packageJsonPath: path.join(outputDir, 'package.json')
  }
}

function copyThemeContents(source: string, destination: string): void {
  const entries = fs.readdirSync(source, { withFileTypes: true })
  for (const entry of entries) {
    if (IGNORE_NAMES.has(entry.name)) continue
    const srcPath = path.join(source, entry.name)
    const destPath = path.join(destination, entry.name)
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true })
      copyThemeContents(srcPath, destPath)
    } else if (entry.isSymbolicLink()) {
      const link = fs.readlinkSync(srcPath)
      fs.symlinkSync(link, destPath)
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

function ensurePackageJson(theme: Theme, options: PackageThemeOptions, outputDir: string): void {
  const packagePath = path.join(outputDir, 'package.json')
  const existing = readJsonIfPresent(packagePath)

  const registryRelative = path.relative(theme.themeRoot, theme.registry).replace(/\\/g, '/')
  const normalizedMain = registryRelative.startsWith('.') ? registryRelative : `./${registryRelative}`
  const templatesDir = options.templatesDir ?? 'templates'

  const pkg = {
    ...existing,
    name: options.packageName ?? existing?.name ?? inferPackageName(theme.themeRoot),
    version: options.packageVersion ?? existing?.version ?? '0.1.0',
    main: normalizedMain,
    files: buildFilesList(existing, registryRelative, templatesDir),
    keywords: mergeKeywords(existing?.keywords, ['theme-registry-theme']),
    themeRegistry: {
      registry: normalizedMain,
      templates: templatesDir
    }
  }

  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2))
}

function readJsonIfPresent(pathname: string): Record<string, any> | undefined {
  if (!fs.existsSync(pathname)) return undefined
  try {
    const raw = fs.readFileSync(pathname, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    return undefined
  }
}

function inferPackageName(themeRoot: string): string {
  const base = path.basename(themeRoot)
  return base.startsWith('@') ? base : `@themes/${base}`
}

function buildFilesList(
  existingPkg: Record<string, any> | undefined,
  registryRelative: string,
  templatesDir: string
): string[] {
  const files = new Set<string>()

  const push = (value?: string) => {
    if (!value) return
    const normalized = value.replace(/^\.\/?/, '').replace(/\\/g, '/')
    if (normalized) {
      files.add(normalized)
    }
  }

  if (Array.isArray(existingPkg?.files)) {
    existingPkg?.files.forEach(entry => {
      if (typeof entry === 'string') {
        push(entry)
      }
    })
  }

  push(registryRelative)
  push(path.dirname(registryRelative))
  push(templatesDir)
  push('theme.ts')
  push('theme.js')
  push('theme.json')

  return Array.from(files).filter(Boolean)
}

function mergeKeywords(existing: unknown, extras: string[]): string[] {
  const keywords = new Set<string>()
  if (Array.isArray(existing)) {
    existing.forEach(item => {
      if (typeof item === 'string') {
        keywords.add(item)
      }
    })
  }
  extras.forEach(item => keywords.add(item))
  return Array.from(keywords)
}
