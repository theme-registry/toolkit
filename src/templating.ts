import fs from 'fs'
import path from 'path'
import { globSync } from 'glob'
import { Theme } from './Theme.js'
import { resolveOptions } from './config.js'
import type { CloneTemplateOptions, CloneTemplateResult } from './types.js'

/**
 * Clones a template file (and optional related files) from one theme into another.
 */
export async function cloneTemplate(options: CloneTemplateOptions): Promise<CloneTemplateResult> {
  const resolved = await resolveOptions(options)
  const sourceThemeRoot = resolveThemeRoot(resolved.themesDir, options.fromTheme)
  const targetThemeRoot = resolveThemeRoot(resolved.themesDir, options.toTheme)

  const sourceTheme = new Theme(sourceThemeRoot, {
    templatesDir: resolved.templatesDir,
    loader: resolved.loader,
    registryModule: resolved.registryModule
  })
  const targetTheme = new Theme(targetThemeRoot, {
    templatesDir: resolved.templatesDir,
    loader: resolved.loader,
    registryModule: resolved.registryModule
  })

  const sourcePath = path.resolve(sourceThemeRoot, options.sourcePath)
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source template not found: ${options.sourcePath}`)
  }

  const targetRelative = options.targetPath ?? options.sourcePath
  const targetPath = path.resolve(targetThemeRoot, targetRelative)
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.copyFileSync(sourcePath, targetPath)

  const copiedFiles: string[] = [targetPath]

  if (options.relatedGlobs?.length) {
    const relatedFiles = findRelatedFiles(sourcePath, options.relatedGlobs)
    relatedFiles.forEach(file => {
      const relative = path.relative(sourceThemeRoot, file)
      const dest = path.resolve(targetThemeRoot, relative)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(file, dest)
      copiedFiles.push(dest)
    })
  }

  targetTheme.addTemplate(targetPath)

  return {
    copiedFiles,
    targetThemeRoot
  }
}

/**
 * Resolves a theme reference into an absolute directory.
 */
function resolveThemeRoot(themesDir: string, requested: string): string {
  const absolute = path.isAbsolute(requested) ? requested : path.join(themesDir, requested)
  if (!fs.existsSync(absolute)) {
    throw new Error(`Theme directory not found: ${requested}`)
  }
  return absolute
}

/**
 * Finds related files adjacent to the source template based on provided globs.
 */
function findRelatedFiles(sourcePath: string, patterns: string[]): string[] {
  const directory = path.dirname(sourcePath)
  const basename = path.basename(sourcePath).replace(path.extname(sourcePath), '')
  const results = new Set<string>()

  patterns.forEach(pattern => {
    const globPattern = pattern.replace('*', basename)
    const matches = globSync(globPattern, { cwd: directory, absolute: true, nodir: true })
    matches.forEach((match: string) => {
      if (match !== sourcePath) {
        results.add(match)
      }
    })
  })

  return Array.from(results)
}
