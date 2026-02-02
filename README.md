# unplugin-datadog-apm

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![Unit Test][unit-test-src]][unit-test-href]

Build-time plugin for Datadog APM instrumentation in bundled Node.js applications. Enables `dd-trace` to instrument bundled modules by wrapping them at build time.

## Why?

When you bundle a Node.js application, `dd-trace`'s runtime instrumentation can't hook into the bundled modules because they're no longer loaded through Node's module system. This plugin solves that by:

1. **CommonJS modules**: Wrapping them to publish to the `dd-trace:bundler:load` diagnostics channel
2. **ESM modules**: Creating proxy modules using `import-in-the-middle` for dd-trace interception

## Installation

```bash
npm i -D unplugin-datadog-apm
```

Requires `dd-trace` as a peer dependency:

```bash
npm i dd-trace
```

## Configuration

```ts
DatadogAPM({
  // Automatically wrap entry points with dd-trace initialization (default: true)
  autoInit: true,

  // Enable debug logging (default: !!process.env.DD_TRACE_DEBUG)
  debug: false,

  // Additional modules to instrument beyond dd-trace defaults
  additionalModules: ["my-custom-module"],

  // Modules to exclude from instrumentation
  excludeModules: ["some-module"],
});
```

## Initialization

dd-trace must initialize BEFORE any HTTP modules are loaded. The plugin handles this automatically.

When `autoInit` is enabled (the default), the plugin detects entry points and wraps them with initialization code that runs before any other code. This ensures dd-trace instruments HTTP and other modules correctly.

The initialization module (`unplugin-datadog-apm/init`):

- Initializes dd-trace
- Registers TracerProvider with OpenTelemetry API (so `trace.getActiveSpan()` works)
- Configures HTTP instrumentation with sensible defaults

## Usage

<details>
<summary>Vite</summary><br>

```ts
// vite.config.ts
import DatadogAPM from "unplugin-datadog-apm/vite";

export default defineConfig({
  plugins: [DatadogAPM()],
});
```

<br></details>

<details>
<summary>Rollup</summary><br>

```ts
// rollup.config.js
import DatadogAPM from "unplugin-datadog-apm/rollup";

export default {
  plugins: [DatadogAPM()],
  external: ["dd-trace", "dc-polyfill", "import-in-the-middle"],
};
```

<br></details>

<details>
<summary>Rolldown / tsdown</summary><br>

```ts
// rolldown.config.ts / tsdown.config.ts
import DatadogAPM from "unplugin-datadog-apm/rolldown";

export default {
  plugins: [DatadogAPM()],
};
```

<br></details>

<details>
<summary>esbuild</summary><br>

```ts
import { build } from "esbuild";
import DatadogAPM from "unplugin-datadog-apm/esbuild";

build({
  plugins: [DatadogAPM()],
  external: ["dd-trace", "dc-polyfill", "import-in-the-middle"],
});
```

<br></details>

<details>
<summary>Webpack</summary><br>

```js
// webpack.config.js
import DatadogAPM from "unplugin-datadog-apm/webpack";

export default {
  plugins: [DatadogAPM()],
  externals: ["dd-trace", "dc-polyfill", "import-in-the-middle"],
};
```

<br></details>

<details>
<summary>Rspack</summary><br>

```ts
// rspack.config.js
import DatadogAPM from "unplugin-datadog-apm/rspack";

export default {
  plugins: [DatadogAPM()],
};
```

<br></details>

## Important Notes

- **Externalize dd-trace**: You must externalize `dd-trace`, `dc-polyfill`, and `import-in-the-middle` in your bundler config. These are runtime dependencies that should not be bundled.
- **Plugin order**: The plugin uses `enforce: 'pre'` to run before other transforms.
- **Module detection**: The plugin uses dd-trace's internal utilities to detect which modules are instrumentable and whether they're ESM or CommonJS.

## Examples

See the [examples](./examples) directory for complete working examples:

- [TanStack Start + Vite + Nitro](./examples/tanstack-start)

## How It Works

### Automatic Entry Wrapping

The plugin uses the bundler's `isEntry` flag to automatically detect entry points. Detected entries are wrapped with virtual modules that import the init code first:

```js
// Generated wrapper for each entry point
import "unplugin-datadog-apm/init";

export * from "./original-entry";
export { default } from "./original-entry";
```

This ensures dd-trace initializes before any HTTP modules are imported, enabling proper instrumentation.

### CommonJS Modules

Wraps CJS modules to publish to the dd-trace diagnostics channel:

```js
(function () {
  /* original code */
})(...arguments);
{
  const dc = require("dc-polyfill");
  const ch = dc.channel("dd-trace:bundler:load");
  ch.publish({ module, version, package, path });
  module.exports = payload.module;
}
```

### ESM Modules

Creates proxy modules using `import-in-the-middle`:

```js
import { register } from "import-in-the-middle/lib/register.js";
import * as namespace from "original-module";

// Re-exports with getters/setters for interception
register(moduleUrl, _, set, get, rawImportPath);
```

## License

[MIT](./LICENSE) License

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/unplugin-datadog-apm.svg
[npm-version-href]: https://npmjs.com/package/unplugin-datadog-apm
[npm-downloads-src]: https://img.shields.io/npm/dm/unplugin-datadog-apm
[npm-downloads-href]: https://www.npmcharts.com/compare/unplugin-datadog-apm?interval=30
[unit-test-src]: https://github.com/sxzz/unplugin-datadog-apm/actions/workflows/unit-test.yml/badge.svg
[unit-test-href]: https://github.com/sxzz/unplugin-datadog-apm/actions/workflows/unit-test.yml
