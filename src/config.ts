import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { createRequire } from 'module'
import { resolveLoader } from './loader.js'
import type {
  ResolvedConfig,
  ThemeRegistryOptions,
  ThemeRegistryUserConfig
} from './types.js'

const moduleUrl = typeof import.meta !== 'undefined' && import.meta.url
  ? import.meta.url
  : pathToFileURL(__filename).href
const require = createRequire(moduleUrl)

const DEFAULT_CONFIG_FILES = [
  'theme-registry.config.js',
  'theme-registry.config.cjs',
  'theme-registry.config.mjs',
  'theme-registry.config.json'
]

/**
 * Loads configuration from disk (js/cjs/mjs/json) or throws when none is found.
 */
export async function loadConfig(configPath?: string): Promise<ThemeRegistryOptions> {
  const cwd = process.cwd()
  const resolvedPath = configPath
    ? path.resolve(cwd, configPath)
    : DEFAULT_CONFIG_FILES.map(filename => path.join(cwd, filename)).find(fs.existsSync)

  if (!resolvedPath) {
    throw new Error('Configuration file was not found. Provide --config or pass CLI options.')
  }

  const extension = path.extname(resolvedPath)

  if (extension === '.json') {
    return JSON.parse(fs.readFileSync(resolvedPath, 'utf8')) as ThemeRegistryUserConfig
  }

  if (extension === '.mjs') {
    const mod = await import(pathToFileURL(resolvedPath).href)
    return normalizeConfigExport(mod.default ?? mod)
  }

  const moduleExports = require(resolvedPath)
  const normalized = moduleExports && moduleExports.__esModule ? moduleExports.default : moduleExports
  return normalizeConfigExport(normalized)
}

/**
 * Resolves configuration into absolute paths and concrete loader instances.
 */
export async function resolveOptions(
  options: ThemeRegistryOptions,
  cwd = process.cwd()
): Promise<ResolvedConfig> {
  if (!options.themesDir) {
    throw new Error('themesDir option is required.')
  }

  const templatesDir = options.templatesDir ?? 'templates'
  const registryModule = options.registryModule ?? '@4i4/registry'
  const loader = await resolveLoader(options.loader, {
    cwd,
    loaderOptions: options.loaderOptions
  })

  return {
    ...options,
    themesDir: path.resolve(cwd, options.themesDir),
    templatesDir,
    registryModule,
    loader
  }
}

/**
 * Normalizes module exports to a plain options object.
 */
function normalizeConfigExport(exported: unknown): ThemeRegistryOptions {
  if (!exported) {
    throw new Error('Configuration file must export an object or a function returning options.')
  }

  if (typeof exported === 'function') {
    const result = exported()
    if (!result) {
      throw new Error('Configuration function returned no options.')
    }
    return result
  }

  if (typeof exported === 'object') {
    return exported as ThemeRegistryOptions
  }

  throw new Error('Unsupported configuration export format.')
}
