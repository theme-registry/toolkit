import type { LoaderContext, LoaderStrategy, TemplateRegistryEntry } from '../types.js'

/**
 * Minimal loader strategy that emits bare dynamic imports for templates.
 */
export class DefaultLoaderStrategy implements LoaderStrategy {
  readonly name = 'default'

  /**
   * Default loader does not inject any header lines.
   */
  getHeaderLines(_context: LoaderContext): string[] {
    return []
  }

  /**
   * Produces the registry.set call for a template using dynamic import.
   */
  createTemplateRegistration(entry: TemplateRegistryEntry): string {
    const contextArg = entry.includeContext ? `, "${entry.context}"` : ''
    return `registry.set("${entry.template}", () => import("./${entry.relativePath}")${contextArg});`
  }

  getSupportedExtensions(): string[] {
    return ['.js', '.jsx', '.ts', '.tsx']
  }
}

/**
 * Shared instance of the default loader strategy.
 */
export const defaultLoader = new DefaultLoaderStrategy()
