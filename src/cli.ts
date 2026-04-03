#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { Command } from 'commander'
import { buildAllThemes, watchThemes } from './builder.js'
import { packageTheme } from './packager.js'
import { cloneTemplate } from './templating.js'
import { discoverThemePackages } from './discovery.js'
import { generateThemeCatalog } from './catalog.js'
import { loadConfig, resolveOptions } from './config.js'
import type { ResolvedConfig, ThemeRegistryOptions } from './types.js'

interface CliOptions {
  config?: string
  themes?: string
  templates?: string
  registryModule?: string
  loader?: string
  loaderOptions?: string
}

const program = new Command()

program
  .name('theme-registry')
  .description('Generate and watch theme registry files independent of your bundler')
  .option('-c, --config <path>', 'Path to theme-registry config file')
  .option('--themes <dir>', 'Directory that contains theme folders')
  .option('--templates <dir>', 'Templates directory inside each theme (default: templates)')
  .option('--loader <module>', 'Loader strategy module or package name')
  .option('--loader-options <json>', 'JSON string forwarded to the loader factory')

program
  .command('build')
  .description('Rebuild all registries once and exit')
  .action(async () => {
    const options = await resolveCliOptions(getGlobalCliOptions())
    await buildAllThemes(options)
    console.log('Theme registries rebuilt successfully.')
  })

program
  .command('watch')
  .description('Watch template folders and update registries on the fly')
  .action(async () => {
    const options = await resolveCliOptions(getGlobalCliOptions())
    const watcher = await watchThemes(options)
    console.log('Watching themes... Press Ctrl+C to stop.')

    const shutdown = async () => {
      await watcher.close()
      process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  })

program
  .command('package <theme>')
  .description('Package a theme directory into a distributable folder')
  .option('--out-dir <dir>', 'Destination directory (default: ./dist-themes/<theme>)')
  .option('--package-name <name>', 'Override the generated package name')
  .option('--package-version <version>', 'Override the generated package version')
  .action(async (theme: string, commandOptions: { outDir?: string; packageName?: string; packageVersion?: string }) => {
    const options = await resolveCliOptions(getGlobalCliOptions())
    const result = await packageTheme({
      ...options,
      theme,
      outDir: commandOptions.outDir,
      packageName: commandOptions.packageName,
      packageVersion: commandOptions.packageVersion
    })
    console.log(`Packaged theme written to ${result.outputDir}`)
  })

program
  .command('clone <source> <from> <to>')
  .description('Clone a template file from one theme into another')
  .option('--target-path <path>', 'Optional destination relative path inside the target theme')
  .option(
    '--with-related <glob...>',
    'Glob patterns (relative to the source file) to copy additional related files'
  )
  .action(async (
    sourcePath: string,
    fromTheme: string,
    toTheme: string,
    commandOptions: { targetPath?: string, withRelated?: string[] }
  ) => {
    const globalOptions = await resolveCliOptions(getGlobalCliOptions())

    const result = await cloneTemplate({
      ...globalOptions,
      fromTheme,
      toTheme,
      sourcePath,
      targetPath: commandOptions.targetPath,
      relatedGlobs: commandOptions.withRelated
    })

    console.log(`Cloned template into ${result.targetThemeRoot}`)
    result.copiedFiles.forEach(file => console.log(` - ${file}`))
  })

program
  .command('list')
  .description('List local and installed theme packages')
  .option('--cwd <path>', 'Directory whose node_modules should be scanned')
  .action(async (commandOptions: { cwd?: string }) => {
    const rows: string[][] = []
    try {
      const resolved = await tryResolveLocalConfig()
      if (resolved) {
        discoverLocalThemes(resolved).forEach(theme => {
          const registryDisplay = theme.registryPath === 'n/a'
            ? 'n/a'
            : path.relative(resolved.themesDir, theme.registryPath).replace(/\\/g, '/')
          rows.push([
            theme.name,
            'local',
            registryDisplay
          ])
        })
      }
    } catch (err) {
      console.error((err as Error).message)
    }

    const discovered = discoverThemePackages({ cwd: commandOptions.cwd ?? process.cwd() })
    discovered.forEach(item => {
      const registryDisplay = item.metadata?.registry
        ? item.metadata.registry
        : item.registryPath
          ? path.relative(process.cwd(), item.registryPath).replace(/\\/g, '/')
          : 'n/a'
      rows.push([
        item.name + (item.version ? `@${item.version}` : ''),
        'package',
        registryDisplay
      ])
    })

    if (rows.length === 0) {
      console.log('No theme packages detected.')
      return
    }

    printTable(['Name', 'Source', 'Registry'], rows)
  })

program
  .command('catalog')
  .description('Generate a theme catalog file for dynamic theme loading')
  .option('--out <path>', 'Output file path (default: <themesDir>/theme-catalog.js)')
  .action(async (commandOptions: { out?: string }) => {
    const options = await resolveCliOptions(getGlobalCliOptions())
    const resolved = await resolveOptions(options)
    const output = generateThemeCatalog({
      resolvedConfig: resolved,
      outputPath: commandOptions.out
    })
    console.log(`Theme catalog generated at ${output}`)
  })

program.parseAsync(process.argv)

/**
 * Merges CLI flags with config file options and validates the result.
 */
async function resolveCliOptions(cli: CliOptions): Promise<ThemeRegistryOptions> {
  const override: Partial<ThemeRegistryOptions> = {}

  if (cli.themes) {
    override.themesDir = cli.themes
  }

  if (cli.templates) {
    override.templatesDir = cli.templates
  }

  if (cli.loader) {
    override.loader = cli.loader
  }

  if (cli.loaderOptions) {
    try {
      override.loaderOptions = JSON.parse(cli.loaderOptions)
    } catch (err) {
      throw new Error('loader-options must be valid JSON')
    }
  }

  const config = await tryLoadConfig(cli.config)
  const merged = {
    ...config,
    ...override
  } as ThemeRegistryOptions

  if (!merged.themesDir) {
    throw new Error('themesDir must be provided via config file or --themes option.')
  }

  return merged
}

/**
 * Attempts to load configuration; returns an empty object when optional config is missing.
 */
async function tryLoadConfig(configPath?: string): Promise<ThemeRegistryOptions> {
  try {
    return await loadConfig(configPath)
  } catch (err) {
    if (configPath) {
      throw err
    }
    return {} as ThemeRegistryOptions
  }
}

/**
 * Retrieves global CLI options regardless of which command invoked the handler.
 */
function getGlobalCliOptions(): CliOptions {
  if (typeof program.optsWithGlobals === 'function') {
    return program.optsWithGlobals()
  }
  if (typeof program.opts === 'function') {
    return program.opts()
  }
  return {}
}

async function tryResolveLocalConfig(): Promise<ResolvedConfig | null> {
  const cliOptions = getGlobalCliOptions()
  try {
    const options = await resolveCliOptions(cliOptions)
    return await resolveOptions(options)
  } catch (err) {
    if (err instanceof Error && err.message.includes('themesDir must be provided')) {
      return null
    }
    throw err
  }
}

function discoverLocalThemes(resolved: ResolvedConfig): Array<{ name: string, root: string, registryPath: string }> {
  try {
    const entries = fs.readdirSync(resolved.themesDir)
    return entries
      .filter(entry => {
        const fullPath = path.join(resolved.themesDir, entry)
        try {
          return fs.lstatSync(fullPath).isDirectory()
        } catch (err) {
          return false
        }
      })
      .map(entry => {
        const root = path.join(resolved.themesDir, entry)
        const registryFile = path.join(root, 'registry.js')
        const registryIndex = path.join(root, 'registry/index.js')
        const registryPath = fs.existsSync(registryFile)
          ? registryFile
          : fs.existsSync(registryIndex)
            ? registryIndex
            : 'n/a'
        return {
          name: entry,
          root,
          registryPath
        }
      })
  } catch (err) {
    return []
  }
}
function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map(row => (row[index] ?? '').length))
  )

  const formatRow = (row: string[]) =>
    row.map((cell, index) => (cell ?? '').padEnd(widths[index])).join('  ')

  console.log(formatRow(headers))
  console.log(widths.map(width => '-'.repeat(width)).join('  '))
  rows.forEach(row => console.log(formatRow(row)))
}
