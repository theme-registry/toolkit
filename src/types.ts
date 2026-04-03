import type { WatchOptions } from 'chokidar'

export interface InternalThemeConfig {
  themesDir: string
  templatesDir: string
  registryModule: string
}

export interface ThemeRegistryUserConfig {
  themesDir: string
  templatesDir?: string
  registryModule?: string
  loader?: LoaderSpecifier
  loaderOptions?: Record<string, unknown>
}

export interface ThemeRegistryOptions {
  themesDir: string
  templatesDir?: string
  registryModule?: string
  loader?: LoaderSpecifier
  loaderOptions?: Record<string, unknown>
}

export interface WatchThemesOptions extends ThemeRegistryOptions {
  watchOptions?: WatchOptions
  onEvent?: (event: ThemeWatcherEvent) => void
}

export interface BuildThemesOptions extends ThemeRegistryOptions {}

export interface PackageThemeOptions extends ThemeRegistryOptions {
  theme: string
  outDir?: string
  packageName?: string
  packageVersion?: string
}

export type LoaderSpecifier = string | LoaderStrategy | LoaderFactory | undefined

export type LoaderFactory = (options?: Record<string, unknown>) => LoaderStrategy

export interface LoaderStrategy {
  readonly name: string
  getHeaderLines?: (context: LoaderContext) => string[]
  createTemplateRegistration: (entry: TemplateRegistryEntry) => string
  getSupportedExtensions?: () => string[]
  shouldIncludeFile?: (filePath: string) => boolean
}

export interface LoaderContext {
  hasParent: boolean
  registryIdentifier: string
}

export interface TemplateRegistryEntry {
  template: string
  relativePath: string
  context: string
  includeContext: boolean
}

export type ThemeSettingsEntry =
  | {
      key: string
      type: 'import'
      importName: string
      importPath: string
    }
  | {
      key: string
      type: 'literal'
      literal: unknown
    }

export interface ThemeWatcherEvent {
  type: 'add' | 'delete' | 'ready' | 'error'
  themeRoot?: string
  templatePath?: string
  error?: Error
}

export interface ThemeWatcherHandle {
  close: () => Promise<void>
}

export interface PackageThemeResult {
  themeRoot: string
  outputDir: string
  packageJsonPath: string
}

export interface CloneTemplateOptions extends ThemeRegistryOptions {
  fromTheme: string
  toTheme: string
  sourcePath: string
  targetPath?: string
  relatedGlobs?: string[]
}

export interface CloneTemplateResult {
  copiedFiles: string[]
  targetThemeRoot: string
}

export interface ThemePackageMetadata {
  registry: string
  templates: string
}

export interface DiscoveredThemePackage {
  name: string
  version?: string
  packageDir: string
  registryPath?: string
  templatesPath?: string
  metadata?: ThemePackageMetadata
}

export interface ThemeConfigShape {
  name?: string
  parent?: string
  context?: string[]
  settings?: Record<string, unknown>
}

export interface ResolvedConfig extends ThemeRegistryOptions {
  themesDir: string
  templatesDir: string
  registryModule: string
  loader: LoaderStrategy
}
