# Theme Registry Toolkit

Bundler-agnostic toolkit that scans theme template folders, generates registry files, and keeps them in sync via a CLI or direct API calls. Pair it with loader packages such as `@theme-registry/react-loader` to emit framework-specific registries, or supply your own loader strategy.

If you previously used `@4i4/theme-registry` (the React wrapper), install `@theme-registry/react-loader` plus this core package instead—the new core provides the CLI/watch/clone/package/catalog commands, while loader packages handle framework integration. You can also run the CLI alongside your existing bundler instead of relying on the legacy `@4i4/theme-registry-webpack-plugin`.

The toolkit contains:

- Core `Theme` class and helpers that understand `theme.ts` / `theme.js` / `theme.json` files, contexts, parent themes, and settings.
- A default loader strategy (plain dynamic `import`) plus support for pluggable loaders (React, Next.js, Angular, etc.) that control how templates are imported into the registry.
- A CLI (`theme-registry`) that can rebuild everything once, watch for changes, or package a theme folder while you run any dev server (Webpack, Turbopack, Vite…).

## Installation

```bash
npm install @theme-registry/toolkit
```

(Install custom loader packages such as `@theme-registry/react-loader` separately when they become available.)

## Commands

```
theme-registry build                  Rebuild all registries once and exit
theme-registry watch                  Watch template folders and update registries on the fly
theme-registry package <theme>        Package a theme directory into a distributable folder
theme-registry clone <source> <from> <to>  Clone a template file from one theme into another
theme-registry list                   List local and installed theme packages
theme-registry catalog                Generate a theme catalog file for dynamic theme loading
theme-registry --help                 Show global options and command-specific usage
```

## Usage

### Basic usage

```
theme-registry [options] [command]

Options:
  -c, --config <path>           Path to theme-registry config file
  --themes <dir>                Directory that contains theme folders
  --templates <dir>             Templates directory inside each theme (default: templates)
  --loader <module>             Loader strategy module or package name
  --loader-options <json>       JSON string forwarded to the loader factory
  -h, --help                    display help for command
```

### Commands in detail

### theme-registry build
Regenerates every registry once using the current configuration and exits.

### theme-registry watch
Runs an initial build and then watches the templates directory, updating registries when files change.

### theme-registry package <theme>
Copies the theme into \`./dist-themes/<theme>\` (or \`--out-dir\`), rebuilds its registry, and writes metadata so it can be published or used as a parent theme.

### theme-registry clone <source> <from> <to>
Clones a template (and optional related files) from the source theme into the target theme and updates the target registry. \`source\` is relative to the source theme root.

### theme-registry list
Prints a table of local themes (based on your config) and installed packages that declare \`themeRegistry\` metadata, showing where each registry lives.

### theme-registry catalog
Generates a \`theme-catalog.js\` file that imports \`@4i4/registry\`, registers every theme loader, and exports helpers for dynamic theme loading.

## Configuration

Create `theme-registry.config.cjs` (or `.js`, `.mjs`, `.json`) at the project root:

```js
module.exports = {
  themesDir: './src/themes',
  templatesDir: 'templates',
  registryModule: '@4i4/registry',
  loader: '@theme-registry/react-loader',
  loaderOptions: {
    suspense: false
  }
}
```

- `themesDir` (required): folder containing individual theme directories.
- `templatesDir` (default `templates`): relative folder inside each theme where templates reside.
- `registryModule` (default `@4i4/registry`): module that exports the `Registry` class used when no parent theme is specified.
- `loader`: loader strategy instance, factory, or module id. The default loader just emits `() => import('./path')` lines; provide a custom loader to integrate React, Next.js, Angular, etc.
- `loaderOptions`: arbitrary JSON passed to loader factories.

### Loader strategy contract

Loader modules must export either:

- an object implementing `{ name: string; createTemplateRegistration(entry); getHeaderLines?(context) }`, or
- a factory function that returns such an object when invoked with `loaderOptions`.

Optional hooks:

- `getSupportedExtensions(): string[]` – limit which file extensions are treated as templates (defaults to `.js`, `.jsx`, `.ts`, `.tsx`).
- `shouldIncludeFile(filePath: string): boolean` – run custom logic to include/exclude files (e.g., only `.component.ts` files).

`entry` contains `{ template, relativePath, context, includeContext }`. Use `includeContext` to decide whether to append `"context"` to the `registry.set` call. `getHeaderLines` can inject framework-specific imports.

Example loader that only registers Angular component files:

```ts
module.exports = () => ({
  name: 'angular-components',
  getSupportedExtensions: () => ['.ts'],
  shouldIncludeFile: filePath => filePath.endsWith('.component.ts'),
  createTemplateRegistration(entry) {
    return `registry.set("${entry.template}", () => import("./${entry.relativePath}").then(m => m.default))${
      entry.includeContext ? `, "${entry.context}"` : ''
    };`
  }
})
```

## CLI usage

```bash
# Rebuild every registry once
npx theme-registry build

# Watch for changes (run in parallel with next dev / webpack dev server)
npx theme-registry --config ./theme-registry.config.cjs watch

# Package a theme into ./dist-themes/<theme>
npx theme-registry package storefront --package-name @4i4/theme-storefront

# Clone a template (and related files) from one theme into another
npx theme-registry clone templates/icons/logo.tsx storefront admin --with-related "*.scss"

# Generate a catalog file listing all themes
npx theme-registry catalog --out ./src/theme-catalog.js
```

Global flags:

- `--themes <dir>` override `themesDir`.
- `--templates <dir>` override `templatesDir`.
- `--registry-module <module>` override registry import module.
- `--loader <module>` override loader strategy.
- `--loader-options '<json>'` forward options to loader factory.
- `-c, --config <path>` load config from a custom path; if omitted the CLI looks for `theme-registry.config.{js,cjs,mjs,json}` and falls back to CLI flags.

The watcher cleans up automatically when you press `Ctrl+C`, so you can pair it with `next dev` using tools like `concurrently`.

## API usage

```ts
import {
  buildAllThemes,
  watchThemes,
  packageTheme,
  cloneTemplate,
  discoverThemePackages,
  loadThemeFromCatalog
} from 'theme-registry'

await buildAllThemes({
  themesDir: './src/themes',
  templatesDir: 'templates',
  loader: '@theme-registry/react-loader'
})

const watcher = await watchThemes({ themesDir: './src/themes' })
// later
await watcher.close()

await packageTheme({
  themesDir: './src/themes',
  theme: 'storefront',
  outDir: './dist-themes/storefront',
  packageName: '@4i4/theme-storefront'
})

await cloneTemplate({
  themesDir: './src/themes',
  fromTheme: 'storefront',
  toTheme: 'admin',
  sourcePath: 'templates/icons/logo.tsx',
  relatedGlobs: ['*.scss']
})

const installedThemes = discoverThemePackages({ cwd: process.cwd() })
console.log(installedThemes.map(theme => theme.name))

import themeCatalog from './theme-catalog.js'
const registry = await loadThemeFromCatalog(themeCatalog, 'child-theme')
```

Use this API if you prefer wiring the registry builder into a custom script instead of the CLI. Pair it with `generateThemeCatalog` (via the CLI) and `loadThemeFromCatalog` to dynamically load registries at runtime.

## Packaging themes

`theme-registry package <theme>` copies the theme directory into a distribution folder (default `./dist-themes/<theme>`), rebuilds the registry, and ensures the generated folder contains a publishable `package.json` pointing to the registry entry.

Options:

- `--out-dir <dir>`: custom destination for the packaged theme folder.
- `--package-name <name>` / `--package-version <version>`: override metadata in the generated `package.json`.
- All global flags (`--themes`, `--templates`, `--registry-module`, `--loader`, `--loader-options`, `-c/--config`) apply, so the command adapts to any layout.

After running the command you can inspect the output directory, run `npm pack`, or publish to npm so the theme can be consumed directly or used as a parent theme.

Packaged themes are automatically marked with:

- `keywords` including `theme-registry-theme`.
- A `themeRegistry` field describing where the registry entry point and templates live.

The CLI and API use this metadata to detect installed theme packages.

## Cloning templates

`theme-registry clone <sourcePath> <fromTheme> <toTheme>` copies a template file (and optionally matching related files) from one theme into another, then updates the target registry. `sourcePath` is relative to the source theme root (for example, `templates/icons/logo.tsx`).

Options:

- `--target-path <path>`: override the destination path inside the target theme (default: reuse the source path).
- `--with-related <glob...>`: copy extra files next to the source template. Globs are evaluated relative to the source directory and can use `*` to match the template basename (e.g., `*.scss` to pull `logo.scss`).

That makes overriding contributed or parent templates a single command: clone the file, tweak it locally, and the registry is already updated.

To see which theme packages are available in `node_modules`, run:

```bash
npx theme-registry list
```

This command lists local themes (based on your current config or `--themes` flag) and scans `node_modules` for packages that declare the `themeRegistry` metadata (or the `theme-registry-theme` keyword), printing their registry/template paths.

## Theme catalogs

Run `theme-registry catalog` (optionally with `--out <path>`) to generate a catalog file that maps theme names to their registry entry points. The generated file imports `@4i4/registry`, exports a `themeCatalog` instance, and provides a `loadTheme` helper, so your app can switch themes at runtime. You can also call `loadThemeFromCatalog` from this package with your own catalog object to load registries programmatically.

## Example project

Check `examples/` for a tiny reference workspace that includes two themes: `base-theme` and `child-theme` (the latter inherits from the former). The folder has its own `package.json` that depends on this package via a relative file reference, so you can run the CLI there without publishing/installing anything globally.

```js
// examples/theme-registry.config.cjs
const path = require('path')

module.exports = {
  themesDir: path.join(__dirname, 'themes'),
  templatesDir: 'templates'
}
```

Folder structure:

```
examples
├── package.json
├── theme-registry.config.cjs
└── themes
    ├── base-theme
    │   ├── theme.json
    │   └── templates/layout/Hero.tsx
    └── child-theme
        ├── theme.json   (parent: "base-theme")
        └── templates/layout/Hero.tsx (override)
```

After running `npm run build` at the repo root (to generate `dist/cli.cjs`), change into `examples/` and use the included scripts:

```bash
npm run build:registry   # generates both theme registries once
npm run watch:registry   # watches templates and updates registries automatically
npm run package:theme    # copies child-theme into ./dist-themes/child-theme
```

Each script calls `node ../dist/cli.cjs ...`, so the root build must succeed first. Use this folder as a starting point to learn the workflow and inspect the generated registries before wiring the CLI into your own repo.

Examples:

```bash
# Clone a local template from storefront into admin
npx theme-registry clone templates/icons/logo.tsx storefront admin

# Clone a template shipped by an installed package (e.g., @4i4/base-theme)
npx theme-registry clone templates/layout/header.tsx @4i4/base-theme storefront --with-related "*.scss"
```

## Theme assumptions

Each theme folder must contain `theme.ts`, `theme.js`, or `theme.json` with the following optional keys:

- `name`: descriptive name.
- `parent`: relative path, sibling theme name, or npm package exposing a registry. The core resolves local folders first, then tries `<package>/registry` and `<package>`.
- `context`: array of allowed contexts; only entries within this list receive `registry.set(..., "context")` arguments.
- `settings`: object of optional settings. String values are treated as module paths (imported at the top of the generated registry). Other values are serialized as JSON literals.

Templates live under `<theme>/<templatesDir>`. Folder structure defines contexts and template names, matching the legacy Webpack plugin:

- Files nested under `templates/<ContextName>/...` get grouped under `// ContextName` sections.
- File names are normalized to kebab-case, both for default and nested contexts.
- `index.js` files collapse to their parent folder name.

### Default folder structure

```
.
├── src
│   └── themes
│       ├── storefront
│       │   ├── theme.json
│       │   └── templates
│       │       ├── layout
│       │       ├── icons
│       │       └── grid
│       └── admin
│           ├── theme.json
│           └── templates
│               └── layout
```

You can change `themesDir` and `templatesDir`, but the idea stays the same: each theme owns its config and templates folder.

### Theme inheritance

Set `parent` in the config to clone another theme’s registry. The core first looks for a sibling directory with that name; if none exists, it attempts to import a package with that name (`<parent>/registry` then `<parent>`).

Example:

```json
{
  "parent": "storefront"
}
```

Generates:

```js
import parent from "../storefront/registry";
const registry = parent.clone();
```

### Using contexts

If `context` is omitted, every template stays in the default scope. Provide an array of folder names to mark which directories should keep their context when registered.

```json
{
  "context": ["icons"]
}
```

Only templates under `templates/icons/**` receive `, "icons"` in the generated `registry.set` call; other directories remain in the default context.

When the CLI (or API) runs in `watch` mode it uses `chokidar` to track `add`/`unlink` events, so renames and moves are handled automatically (unlink + add). In `build` mode it scans every theme and rewrites the registry from scratch.

## Publishing

- `npm run build` transpiles the TypeScript sources via `tsup` (CJS + ESM bundles + `.d.ts`).
- `files` in `package.json` ensures only `dist/` is published.
- `bin.theme-registry` points to the CLI entry (`dist/cli.cjs`).

After running `npm run build`, publish with `npm publish --access public` (or your preferred registry).
