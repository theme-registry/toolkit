import { pathToFileURL } from 'url'

/**
 * Returns the current module URL across both ESM and CJS builds without
 * referencing import.meta directly (which breaks CJS bundlers).
 */
export function getModuleUrl(): string {
  const metaUrl = tryGetImportMetaUrl()
  if (metaUrl) return metaUrl

  if (typeof __filename !== 'undefined') {
    return pathToFileURL(__filename).href
  }

  return pathToFileURL(process.cwd()).href
}

function tryGetImportMetaUrl(): string | undefined {
  try {
    const fn = Function(
      'return typeof import.meta !== "undefined" ? import.meta.url : undefined'
    ) as () => string | undefined
    return fn()
  } catch {
    return undefined
  }
}
