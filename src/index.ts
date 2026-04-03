export { Theme } from './Theme.js'
export { buildAllThemes, watchThemes } from './builder.js'
export { packageTheme } from './packager.js'
export { cloneTemplate } from './templating.js'
export { loadConfig, resolveOptions } from './config.js'
export { defaultLoader, DefaultLoaderStrategy } from './loaders/defaultLoader.js'
export { generateThemeCatalog, loadThemeFromCatalog } from './catalog.js'
export type {
  BuildThemesOptions,
  CloneTemplateOptions,
  CloneTemplateResult,
  ThemePackageMetadata,
  DiscoveredThemePackage,
  LoaderContext,
  LoaderSpecifier,
  LoaderStrategy,
  PackageThemeOptions,
  PackageThemeResult,
  ResolvedConfig,
  TemplateRegistryEntry,
  ThemeRegistryOptions,
  ThemeRegistryUserConfig,
  ThemeSettingsEntry,
  ThemeWatcherEvent,
  ThemeWatcherHandle,
  WatchThemesOptions
} from './types.js'
export { ThemeNotFoundError } from './errors.js'
export { discoverThemePackages } from './discovery.js'
