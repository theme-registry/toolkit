import fs from 'fs'
import path from 'path'
import chokidar from 'chokidar'
import { Theme } from './Theme.js'
import { resolveOptions } from './config.js'
import type {
  BuildThemesOptions,
  ResolvedConfig,
  ThemeWatcherEvent,
  ThemeWatcherHandle,
  WatchThemesOptions
} from './types.js'

/**
 * Rebuilds every theme registry once using the supplied options.
 */
export async function buildAllThemes(options: BuildThemesOptions): Promise<Theme[]> {
  const resolved = await resolveOptions(options)
  const themes = loadThemes(resolved)
  themes.forEach(theme => theme.rebuild())
  return themes
}

/**
 * Watches template folders for changes and updates registries incrementally.
 */
export async function watchThemes(options: WatchThemesOptions): Promise<ThemeWatcherHandle> {
  const resolved = await resolveOptions(options)
  const themes = loadThemes(resolved)
  themes.forEach(theme => theme.rebuild())

  const templatePattern = path.join(
    resolved.themesDir,
    '*',
    resolved.templatesDir,
    '**',
    '*'
  )

  const watcher = chokidar.watch(templatePattern, {
    ignoreInitial: true,
    ignored: watchedPath => shouldIgnorePath(watchedPath),
    ...options.watchOptions
  })

  const templatesRoots = new Map<string, Theme>()
  themes.forEach(theme => templatesRoots.set(theme.templatesRoot, theme))

  const findTheme = (filePath: string): Theme | undefined => {
    const normalizedFile = path.resolve(filePath)
    for (const [root, theme] of templatesRoots.entries()) {
      const normalizedRoot = path.resolve(root)
      if (normalizedFile.startsWith(normalizedRoot)) {
        return theme
      }
    }
    return undefined
  }

  const emit = (event: ThemeWatcherEvent): void => {
    options.onEvent?.(event)
  }

  watcher.on('add', filePath => {
    const theme = findTheme(filePath)
    if (!theme) return
    theme.addTemplate(filePath)
    emit({ type: 'add', themeRoot: theme.themeRoot, templatePath: filePath })
  })

  watcher.on('unlink', filePath => {
    const theme = findTheme(filePath)
    if (!theme) return
    theme.deleteTemplate(filePath)
    emit({ type: 'delete', themeRoot: theme.themeRoot, templatePath: filePath })
  })

  watcher.on('ready', () => emit({ type: 'ready' }))
  watcher.on('error', error => emit({ type: 'error', error }))

  return {
    async close() {
      await watcher.close()
    }
  }
}

/**
 * Determines whether a filesystem path should be ignored by the watcher.
 */
function shouldIgnorePath(targetPath: string): boolean {
  if (!fs.existsSync(targetPath)) return false
  try {
    const stat = fs.lstatSync(targetPath)
    if (stat.isDirectory()) return false
    const basename = path.basename(targetPath)
    return Theme.skip.test(basename)
  } catch (err) {
    return false
  }
}

/**
 * Instantiates Theme objects for every directory inside the configured themesDir.
 */
function loadThemes(resolved: ResolvedConfig): Theme[] {
  const pathNames = safeReadDir(resolved.themesDir)
  const themes: Theme[] = []

  for (const pathname of pathNames) {
    const fullPath = path.join(resolved.themesDir, pathname)
    if (!fs.existsSync(fullPath)) continue
    const stat = fs.lstatSync(fullPath)
    if (!stat.isDirectory()) continue

    try {
      themes.push(
        new Theme(fullPath, {
          templatesDir: resolved.templatesDir,
          loader: resolved.loader,
          registryModule: resolved.registryModule
        })
      )
    } catch (err) {
      console.warn((err as Error).message)
    }
  }

  return themes
}

/**
 * Reads directory entries or throws an explicit error if it fails.
 */
function safeReadDir(directory: string): string[] {
  try {
    return fs.readdirSync(directory)
  } catch (err) {
    throw new Error(`Unable to read directory: ${directory}`)
  }
}
