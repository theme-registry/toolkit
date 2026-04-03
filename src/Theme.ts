import { EOL } from 'os'
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { pathToFileURL } from 'url'
import { ThemeNotFoundError } from './errors.js'
import type {
  LoaderContext,
  LoaderStrategy,
  TemplateRegistryEntry,
  ThemeConfigShape,
  ThemeSettingsEntry
} from './types.js'

const moduleUrl = typeof import.meta !== 'undefined' && import.meta.url
  ? import.meta.url
  : pathToFileURL(__filename).href
const require = createRequire(moduleUrl)
const DEFAULT_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx']

export interface ThemeOptions {
  templatesDir: string
  loader: LoaderStrategy
  registryModule: string
}

/**
 * Represents a single theme folder and encapsulates registry and template management.
 * Instances can rebuild the entire registry or react to individual template changes.
 */
export class Theme {
  static skip = /.*(?<!((?<!(?:style|type|mock|test|stories)(?:s)?\.?)(?:ts|js|jsx|tsx)))$/
  private static tsCompilerRegistered = false

  readonly themeRoot: string
  readonly templatesDir: string
  private readonly loader: LoaderStrategy
  private readonly registryModule: string
  private readonly config: ThemeConfigShape
  private readonly registryPath: string
  private readonly supportedExtensions: Set<string>

  /**
   * Creates a theme scoped to the provided root directory.
   * Automatically loads theme config and locates/creates the registry file.
   */
  constructor(themeRoot: string, options: ThemeOptions) {
    this.themeRoot = themeRoot
    this.templatesDir = options.templatesDir
    this.loader = options.loader
    this.registryModule = options.registryModule
    this.supportedExtensions = new Set(
      (this.loader.getSupportedExtensions?.() ?? DEFAULT_EXTENSIONS).map(extension =>
        extension.startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`
      )
    )

    this.config = this.loadConfig()
    this.registryPath = this.findRegistry()
  }

  /**
   * Absolute path to the templates directory inside the theme.
   */
  get templatesRoot(): string {
    return path.join(this.themeRoot, this.templatesDir)
  }

  /**
   * Absolute path to the registry file for this theme.
   */
  get registry(): string {
    return this.registryPath
  }

  /**
   * Raw settings object from theme config, normalized to an empty map.
   */
  get settings(): Record<string, unknown> {
    return this.config.settings ?? {}
  }

  /**
   * Rebuilds the registry from scratch by scanning every template file.
   */
  rebuild(): void {
    let content = this.newContent()
    try {
      const templates = this.scanTemplatesDir(this.templatesRoot)
      templates.forEach(template => {
        content = this.updateContent(template, 'add', content)
      })

      this.writeRegistry(content)
    } catch (err) {
      console.warn(err)
    }
  }

  /**
   * Adds or updates a single template entry inside the registry.
   */
  addTemplate(template: string): void {
    if (!this.shouldIncludeTemplateFile(template)) return
    const lines = this.updateContent(template, 'add')
    this.writeRegistry(lines)
  }

  /**
   * Removes a template entry from the registry if it exists.
   */
  deleteTemplate(template: string): void {
    if (!this.shouldIncludeTemplateFile(template)) return
    const lines = this.updateContent(template, 'delete')
    this.writeRegistry(lines)
  }

  /**
   * Loads the theme configuration file (json/js/ts) and returns the parsed object.
   */
  private loadConfig(): ThemeConfigShape {
    const pathname = this.findConfigPath()
    if (!pathname) {
      throw new ThemeNotFoundError(
        `Theme (${this.themeRoot}) could not be found. Missing theme.ts, theme.js or theme.json file.`
      )
    }

    const extension = path.extname(pathname)

    if (extension === '.json') {
      const content = fs.readFileSync(pathname, 'utf8')
      return JSON.parse(content)
    }

    if (extension === '.ts') {
      Theme.registerTsCompiler()
    }

    const configModule = require(pathname)
    return configModule && configModule.__esModule ? configModule.default : configModule
  }

  /**
   * Locates the config file inside the theme directory, if any.
   */
  private findConfigPath(): string | undefined {
    return ['theme.ts', 'theme.js', 'theme.json']
      .map(filename => path.join(this.themeRoot, filename))
      .find(candidate => fs.existsSync(candidate))
  }

  /**
   * Lazily registers ts-node so theme.ts configs can be required at runtime.
   */
  private static registerTsCompiler(): void {
    if (this.tsCompilerRegistered) return

    try {
      require('ts-node/register/transpile-only')
    } catch (err) {
      try {
        require('ts-node/register')
      } catch (innerErr) {
        throw new ThemeNotFoundError(
          'Theme configuration requires ts-node to load theme.ts files. Install ts-node or convert the config to theme.js or theme.json.'
        )
      }
    }

    this.tsCompilerRegistered = true
  }

  /**
   * Resolves the registry file path (or creates a default file/directory when missing).
   */
  private findRegistry(): string {
    const basename = fs
      .readdirSync(this.themeRoot)
      .find(entry => /^registry(.(js|ts))?$/.test(entry))

    if (!basename) return this.createRegistryFile()

    let registryPath = path.join(this.themeRoot, basename)
    const isDir = fs.lstatSync(registryPath).isDirectory()

    if (isDir) {
      const indexFile = fs.readdirSync(registryPath).find(entry => /^index\.(js|ts)$/.test(entry))
      if (!indexFile) return this.createRegistryFile(true)
      registryPath = path.join(registryPath, indexFile)
    }

    return registryPath
  }

  /**
   * Creates a fresh registry file (or directory + index) and writes initial content.
   */
  private createRegistryFile(dir = false): string {
    const lines = this.newContent()
    const target = path.join(this.themeRoot, dir ? 'registry/index.js' : 'registry.js')
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, lines.join(EOL), { encoding: 'utf8' })
    return target
  }

  /**
   * Produces the base content of a registry file before template entries are injected.
   */
  private newContent(): string[] {
    const content: string[] = []
    const settingsEntries = this.getSettingsEntries()
    const importSettings = settingsEntries.filter(entry => entry.type === 'import') as Extract<
      ThemeSettingsEntry,
      { type: 'import' }
    >[]
    const hasParent = Boolean(this.config.parent)

    content.push('// Auto-generated by theme-registry. Do not edit manually.')

    if (hasParent) {
      const parentImportPath = this.resolveParentImport()
      content.push(`import parent from "${parentImportPath}";`)
    } else {
      content.push(`import Registry from "${this.registryModule}";`)
    }

    if (typeof this.loader.getHeaderLines === 'function') {
      const headerContext: LoaderContext = {
        hasParent,
        registryIdentifier: 'registry'
      }
      this.loader.getHeaderLines(headerContext).forEach(line => content.push(line))
    }

    importSettings.forEach(entry => {
      content.push(`import ${entry.importName} from "${entry.importPath}";`)
    })

    content.push('')
    content.push(`const registry = ${hasParent ? 'parent.clone()' : 'new Registry()'};`)
    content.push('')

    if (settingsEntries.length > 0) {
      content.push('// Settings')
      settingsEntries.forEach(entry => {
        if (entry.type === 'import') {
          content.push(`registry.set("${entry.key}", ${entry.importName}, "_settings");`)
        } else {
          content.push(`registry.set("${entry.key}", ${JSON.stringify(entry.literal)}, "_settings");`)
        }
      })
      content.push('')
    }

    content.push('// Templates')
    content.push('')
    content.push('export default registry;')

    return content
  }

  /**
   * Normalizes settings into import or literal entries ready for registry injection.
   */
  private getSettingsEntries(): ThemeSettingsEntry[] {
    const entries: ThemeSettingsEntry[] = []
    const settings = this.settings

    if (!settings || typeof settings !== 'object') return entries

    Object.entries(settings)
      .filter(([, value]) => value !== undefined && value !== null)
      .forEach(([key, value]) => {
        if (typeof value === 'string') {
          entries.push({
            key,
            type: 'import',
            importName: this.buildSettingImportName(key),
            importPath: this.normalizeSettingPath(value)
          })
        } else {
          entries.push({ key, type: 'literal', literal: value })
        }
      })

    return entries
  }

  /**
   * Builds a stable PascalCase import identifier for a settings key.
   */
  private buildSettingImportName(key: string): string {
    const pascal = key
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('') || 'Setting'

    return `settings${pascal}`
  }

  /**
   * Ensures settings import paths are relative/absolute module specifiers.
   */
  private normalizeSettingPath(value: string): string {
    const normalized = value.replace(/\\/g, '/').trim()
    if (normalized.startsWith('.') || normalized.startsWith('@') || normalized.startsWith('/')) {
      return normalized
    }
    return `./${normalized}`
  }

  /**
   * Resolves the import path for the parent theme registry, local or external.
   */
  private resolveParentImport(): string {
    const parentName = this.config.parent
    if (!parentName) {
      throw new ThemeNotFoundError('Parent theme is not defined')
    }

    const localPath = path.join(this.themeRoot, '..', parentName)
    if (fs.existsSync(localPath)) {
      const parentTheme = new Theme(localPath, {
        templatesDir: this.templatesDir,
        loader: this.loader,
        registryModule: this.registryModule
      })
      const relative = path.relative(this.themeRoot, parentTheme.registry).replace(/\\/g, '/')
      return relative.startsWith('.') ? relative : `./${relative}`
    }

    const moduleCandidates = [`${parentName}/registry`, parentName]
    for (const candidate of moduleCandidates) {
      if (this.canResolveModule(candidate)) {
        return candidate
      }
    }

    throw new ThemeNotFoundError(`Parent theme ${parentName} was not found`)
  }

  /**
   * Checks whether Node can resolve a module specifier relative to the theme.
   */
  private canResolveModule(specifier: string): boolean {
    try {
      require.resolve(specifier, { paths: [this.themeRoot] })
      return true
    } catch (err) {
      try {
        require.resolve(specifier)
        return true
      } catch (innerErr) {
        return false
      }
    }
  }

  /**
   * Inserts or removes a template entry from the registry content array.
   */
  private updateContent(template: string, action: 'add' | 'delete', content?: string[]): string[] {
    const lines = content ?? this.readRegistry()
    const entry = this.getTemplateObject(template)
    entry.includeContext = (this.config.context ?? []).includes(entry.context)
    const line = this.loader.createTemplateRegistration(entry)
    const index = lines.indexOf(line)

    if (action === 'delete' && index >= 0) {
      lines.splice(index, 1)
      return lines
    }

    if (action === 'add' && index < 0) {
      const contextLine = `// ${entry.context.charAt(0).toUpperCase() + entry.context.slice(1)}`
      const contextIndex = lines.indexOf(contextLine)
      if (contextIndex >= 0) {
        lines.splice(contextIndex + 1, 0, line)
      } else {
        lines.splice(lines.length - 1, 0, contextLine, line, '')
      }
    }

    return lines
  }

  /**
   * Reads the current registry file and splits it into line array form.
   */
  private readRegistry(): string[] {
    const content = fs.readFileSync(this.registryPath, 'utf8')
    return content.split(EOL)
  }

  /**
   * Writes the registry content if it differs from the persisted version.
   */
  private writeRegistry(content: string[]): void {
    if (!this.sameWithOriginal(content)) {
      fs.mkdirSync(path.dirname(this.registryPath), { recursive: true })
      fs.writeFileSync(this.registryPath, content.join(EOL), { encoding: 'utf8' })
    }
  }

  /**
   * Determines whether the provided content matches what is stored on disk.
   */
  private sameWithOriginal(content: string[]): boolean {
    if (!fs.existsSync(this.registryPath)) return false
    const original = this.readRegistry()
    return JSON.stringify(original) === JSON.stringify(content)
  }

  /**
   * Converts a template file path into registry metadata (context/name/relative path).
   */
  private getTemplateObject(template: string): TemplateRegistryEntry {
    const registryDir = /registry\.(js|ts)$/.test(this.registryPath)
      ? this.themeRoot
      : path.join(this.themeRoot, 'registry')
    const relative = path.relative(registryDir, template)
    const normalized = relative.replace(/\\/g, '/')
    const components = normalized.split('/')
    const entry: TemplateRegistryEntry = {
      context: 'default',
      template: '',
      relativePath: normalized.replace(/(\/index)?\.(js|jsx|ts|tsx)$/, ''),
      includeContext: false
    }

    if (components.length <= 2) {
      const target = components[components.length - 1] ?? ''
      entry.template = this.getTemplateName(target.replace(/(?=.*)(?:\.(js|jsx|ts|tsx))$/, ''))
      return entry
    }

    entry.context = components.splice(0, 2)[1]?.toLowerCase() ?? 'default'
    entry.template =
      components
        .map((item, index) => {
          const name = this.getTemplateName(item)
          const prev = this.getTemplateName(components[index - 1] ?? '')
          return name === 'index' || name === prev ? null : name
        })
        .filter(Boolean)
        .join('--') || entry.context

    return entry
  }

  /**
   * Normalizes filenames to kebab-case names used inside the registry.
   */
  private getTemplateName(name: string): string {
    let result = name.replace(/\.[^/.]+$/, '')
    result = result.split(/(?=[A-Z])/).join('-')
    result = result.split('.').join('--')
    return result.toLowerCase()
  }

  /**
   * Recursively scans the templates directory and returns template files.
   */
  private scanTemplatesDir(destination: string): string[] {
    if (!fs.existsSync(destination)) return []
    const entries = fs.readdirSync(destination)
    let templates: string[] = []

    for (const entry of entries) {
      const candidate = path.join(destination, entry)
      const stat = fs.lstatSync(candidate)
      if (stat.isDirectory()) {
        templates = templates.concat(this.scanTemplatesDir(candidate))
      } else if (stat.isFile() && this.shouldIncludeTemplateFile(candidate)) {
        templates.push(candidate)
      }
    }

    return templates
  }

  private shouldIncludeTemplateFile(pathname: string): boolean {
    const basename = path.basename(pathname)
    if (Theme.skip.test(basename)) {
      return false
    }

    const extension = path.extname(basename).toLowerCase()
    if (this.supportedExtensions.size > 0 && !this.supportedExtensions.has(extension)) {
      return false
    }

    if (typeof this.loader.shouldIncludeFile === 'function') {
      return this.loader.shouldIncludeFile(pathname)
    }

    return true
  }
}
