# unplugin-datadog-apm

## 0.2.3

### Patch Changes

- 5ef2398: Remove unused `nitro-plugin` export. This module was never integrated into the Vite plugin and provided no functionality. Users should use `--import unplugin-datadog-apm/register` for initialization instead.
- 7eefd60: Add workaround for dd-trace URL instrumentation error on Node.js 22+. Disable URL instrumentation in nitro example and document the workaround in KNOWN_ISSUES.md.

## 0.2.2

### Patch Changes

- 30bc266: chore: test CI release workflow
- 30bc266: chore: test release workflow

## 0.2.1

### Patch Changes

- chore: test release workflow

## 0.2.0

### Minor Changes

- 218c845: Initial public release.
- f2dcfd0: Add `unplugin-datadog-apm/register` entrypoint for use with Node.js `--import` flag. This enables zero-config APM by running `node --import unplugin-datadog-apm/register ./app.js`. Also adds `unplugin-datadog-apm/register-helpers` exporting `setupTracer` and `registerLoaderHook` for custom register files with advanced tracer configuration.
- 218c845: Add `tracerOptions` option to forward configuration to dd-trace init. This allows customizing service name, sampling rules, and other dd-trace settings directly through the plugin options.

### Patch Changes

- 218c845: Add safety guard for esbuild builds using --minify without --keep-names. This configuration breaks dd-trace instrumentation, so the plugin now throws an error with a clear message instead of producing a silently broken bundle.
- 218c845: Use explicit object-style entrypoints in tsdown config with named keys matching package.json exports.
- 218c845: Escape git and package metadata when generating wrappers to prevent code injection.

## 0.1.0

### Minor Changes

- Initial public release.

### Patch Changes

- Switch to a raw tsdown config and align output file extensions.
