import fs from 'fs'
import path from 'path'
import chokidar from 'chokidar'
import { Theme } from './Theme.js'
import { resolveOptions } from './config.js'
import { generateThemeCatalog } from './catalog.js'
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
  const normalizedThemesDir = path.resolve(resolved.themesDir)
  const themes = loadThemes(resolved)
  const themesByRoot = new Map<string, Theme>()

  const registerThemeInstance = (theme: Theme): void => {
    const normalizedRoot = path.resolve(theme.themeRoot)
    themesByRoot.set(normalizedRoot, theme)
  }

  const regenerateCatalog = (): void => {
    try {
      generateThemeCatalog({ resolvedConfig: resolved })
    } catch (err) {
      console.warn('Failed to generate theme catalog:', (err as Error).message)
    }
  }

  themes.forEach(registerThemeInstance)
  themes.forEach(theme => theme.rebuild())
  regenerateCatalog()

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

  const resolveThemeRootFromPath = (filePath: string): string | undefined => {
    const normalizedFile = path.resolve(filePath)
    if (!normalizedFile.startsWith(normalizedThemesDir)) {
      return undefined
    }

    const relative = path.relative(normalizedThemesDir, normalizedFile)
    const [themeFolder] = relative.split(path.sep)
    if (!themeFolder) {
      return undefined
    }

    return path.join(normalizedThemesDir, themeFolder)
  }

  const findTheme = (filePath: string): Theme | undefined => {
    const themeRoot = resolveThemeRootFromPath(filePath)
    if (!themeRoot) return undefined
    return themesByRoot.get(path.resolve(themeRoot))
  }

  const registerTheme = (themeRoot: string): Theme | undefined => {
    const normalizedRoot = path.resolve(themeRoot)
    if (themesByRoot.has(normalizedRoot)) {
      return themesByRoot.get(normalizedRoot)
    }

    try {
      const theme = new Theme(normalizedRoot, {
        templatesDir: resolved.templatesDir,
        loader: resolved.loader,
        registryModule: resolved.registryModule
      })
      registerThemeInstance(theme)
      theme.rebuild()
      regenerateCatalog()
      return theme
    } catch (err) {
      console.warn((err as Error).message)
      return undefined
    }
  }

  const ensureTheme = (filePath: string): Theme | undefined => {
    const existing = findTheme(filePath)
    if (existing) return existing
    const themeRoot = resolveThemeRootFromPath(filePath)
    if (!themeRoot) return undefined
    return registerTheme(themeRoot)
  }

  const emit = (event: ThemeWatcherEvent): void => {
    options.onEvent?.(event)
  }

  watcher.on('add', filePath => {
    const theme = ensureTheme(filePath)
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
