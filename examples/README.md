# Example Theme Workspace

This directory contains two example themes that demonstrate how the `theme-registry` toolkit works:

- `base-theme`: a parent theme with its own settings and templates.
- `child-theme`: inherits from `base-theme` and overrides the `Hero` template.

## Prerequisites

1. From the repository root run `npm install` (if you haven’t already).
2. Run `npm run build` at the root to produce `dist/cli.cjs`.

After that you can run the scripts below from this `examples/` folder without installing any additional dependencies.

## Scripts

```bash
npm run build:registry   # Generates registries for both themes once
npm run watch:registry   # Watches the templates and updates registries automatically
npm run package:theme    # Packages child-theme into ./dist-themes/child-theme (package the parent first!)
npm run list:themes      # Lists local themes + contributed packages
npm run catalog          # Generates theme-catalog.js for runtime theme switching
```

All scripts call `node ../dist/cli.cjs ...`, so they will fail if the root build hasn’t run yet.

## Manual commands

If you prefer running commands directly:

```bash
node ../dist/cli.cjs build --config ./theme-registry.config.cjs
node ../dist/cli.cjs watch --config ./theme-registry.config.cjs
node ../dist/cli.cjs package base-theme --config ./theme-registry.config.cjs
node ../dist/cli.cjs package child-theme --config ./theme-registry.config.cjs
node ../dist/cli.cjs list --config ./theme-registry.config.cjs
node ../dist/cli.cjs catalog --config ./theme-registry.config.cjs --out ./theme-catalog.js
```

`npm run catalog` writes `theme-catalog.js` at the root of this workspace. Import that file and use `loadThemeFromCatalog` from the main package to load registries dynamically.

The example config (`theme-registry.config.cjs`) points `themesDir` to `./themes`, so feel free to add more themes or tweak the existing ones. If you plan to reuse `child-theme` outside this repo, package `base-theme` first (or change the `parent` in `child-theme/theme.json` to a published package name) so the parent dependency resolves.
