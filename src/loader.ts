import path from 'path'
import { pathToFileURL } from 'url'
import { createRequire } from 'module'
import { defaultLoader } from './loaders/defaultLoader.js'
import { getModuleUrl } from './utils/moduleUrl.js'
import type { LoaderSpecifier, LoaderStrategy } from './types.js'

const require = createRequire(getModuleUrl())

interface LoaderResolveOptions {
  cwd: string
  loaderOptions?: Record<string, unknown>
}

/**
 * Resolves the loader specifier into a concrete LoaderStrategy instance.
 */
export async function resolveLoader(
  specifier: LoaderSpecifier,
  options: LoaderResolveOptions
): Promise<LoaderStrategy> {
  if (!specifier) return defaultLoader

  if (isLoaderStrategy(specifier)) {
    return specifier
  }

  if (typeof specifier === 'function') {
    const candidate = specifier(options.loaderOptions)
    if (isLoaderStrategy(candidate)) return candidate
    throw new Error('Loader factory must return a LoaderStrategy instance.')
  }

  if (typeof specifier === 'string') {
    const modulePath = resolveModule(specifier, options.cwd)
    const loaded = await loadModule(modulePath)
    const normalized = normalizeLoaderExport(loaded, options.loaderOptions)
    if (isLoaderStrategy(normalized)) return normalized
    throw new Error('Loader module must export a LoaderStrategy instance or factory.')
  }

  throw new Error('Invalid loader specification provided.')
}

/**
 * Type guard to determine whether a value matches LoaderStrategy.
 */
function isLoaderStrategy(candidate: unknown): candidate is LoaderStrategy {
  return Boolean(candidate && typeof (candidate as LoaderStrategy).createTemplateRegistration === 'function')
}

/**
 * Resolves loader module IDs relative to the consuming project.
 */
function resolveModule(request: string, cwd: string): string {
  try {
    return require.resolve(request, { paths: [cwd] })
  } catch (err) {
    throw new Error(`Unable to resolve loader module: ${request}`)
  }
}

/**
 * Dynamically imports or requires the loader module.
 */
async function loadModule(modulePath: string): Promise<unknown> {
  if (modulePath.endsWith('.mjs')) {
    const mod = await import(pathToFileURL(modulePath).href)
    return mod.default ?? mod
  }

  if (modulePath.endsWith('.cjs') || modulePath.endsWith('.js')) {
    const mod = require(modulePath)
    return mod && mod.__esModule ? mod.default : mod
  }

  if (path.extname(modulePath) === '') {
    const mod = require(modulePath)
    return mod && mod.__esModule ? mod.default : mod
  }

  const mod = require(modulePath)
  return mod && mod.__esModule ? mod.default : mod
}

/**
 * Normalizes the exported value into a LoaderStrategy instance.
 */
function normalizeLoaderExport(
  exported: unknown,
  loaderOptions?: Record<string, unknown>
): LoaderStrategy | undefined {
  if (!exported) return undefined
  if (isLoaderStrategy(exported)) return exported
  if (typeof exported === 'function') {
    const candidate = exported(loaderOptions)
    if (isLoaderStrategy(candidate)) return candidate
    return undefined
  }
  return undefined
}
