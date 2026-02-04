# unplugin-datadog-apm

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![CI][ci-src]][ci-href]

> **Note**: This is an unofficial, community-maintained project. It is not affiliated with, endorsed by, or supported by Datadog, Inc.

Build-time plugin for Datadog APM instrumentation in bundled Node.js applications. Enables `dd-trace` to instrument bundled modules by wrapping them at build time. This plugin does not instrument anything itself; `dd-trace` still performs the runtime instrumentation, and this plugin only injects the hooks needed for auto-instrumentation to work in a bundle.

## Why?

When you bundle a Node.js application, `dd-trace`'s runtime instrumentation can't hook into the bundled modules because they're no longer loaded through Node's module system. This plugin solves that by:

1. **CommonJS modules**: Wrapping them to publish to the `dd-trace:bundler:load` diagnostics channel
2. **ESM modules**: Creating proxy modules using `import-in-the-middle` for dd-trace interception

## Installation

```bash
npm i unplugin-datadog-apm
```

Requires `dd-trace` as a peer dependency:

```bash
npm i dd-trace
```

## Requirements

- Node.js >=22.0.0
- dd-trace >=5.0.0 (peer dependency)
- ESM-only package: use ESM import syntax in bundler config files
- If you use the Vite adapter, Vite >=7.0.0

## Quick Start

**1. Add the plugin to your bundler config:**

```ts
// vite.config.ts
import DatadogAPM from "unplugin-datadog-apm/vite";

export default defineConfig({
  plugins: [DatadogAPM()],
  ssr: { external: DatadogAPM.externals },
  build: { rollupOptions: { external: DatadogAPM.externals } },
});
```

**2. Run your app with the `--import` flag:**

```bash
node --import unplugin-datadog-apm/register dist/server.js
```

That's it! dd-trace will automatically instrument your bundled application.

## Configuration

### Plugin Options

```ts
DatadogAPM({
  // Enable debug logging (default: !!process.env.DD_TRACE_DEBUG)
  debug: false,

  // Additional modules to instrument beyond dd-trace defaults
  additionalModules: ["my-custom-module"],

  // Modules to exclude from instrumentation
  excludeModules: ["some-module"],
});
```

### Runtime Configuration

dd-trace is configured at runtime via environment variables:

```bash
DD_SERVICE=my-app \
DD_ENV=production \
DD_VERSION=1.2.3 \
node --import unplugin-datadog-apm/register dist/server.js
```

See [Datadog's Node.js configuration docs](https://docs.datadoghq.com/tracing/trace_collection/library_config/nodejs/) for all available options.

### Custom Register File

For advanced configuration (custom `tracer.use()` calls, sampling rules, hooks), create your own register file:

```js
// scripts/datadog-register.mjs
import tracer from "dd-trace";
import {
  setupESMImports,
  setupOpenTelemetry,
} from "unplugin-datadog-apm/register-helpers";

tracer.init({
  service: "my-app",
  env: "production",
});

// Silence health check endpoints
tracer.use("http", {
  hooks: {
    request: (span, req) => {
      if (req.url === "/health") {
        span.setTag("manual.drop", true);
      }
    },
  },
});

// Add user context to express spans
tracer.use("express", {
  hooks: {
    request: (span, req) => {
      span.setTag("user.id", req.user?.id);
    },
  },
});

setupOpenTelemetry(tracer);
setupESMImports();
```

Then run with your custom register:

```bash
node --import ./scripts/datadog-register.mjs dist/server.js
```

## Bundler Setup

Each bundler import provides a `.externals` property with the list of modules that must be externalized for dd-trace to work correctly.

<details>
<summary>Vite</summary><br>

```ts
// vite.config.ts
import DatadogAPM from "unplugin-datadog-apm/vite";

export default defineConfig({
  plugins: [DatadogAPM()],
  ssr: { external: DatadogAPM.externals },
  build: { rollupOptions: { external: DatadogAPM.externals } },
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
  external: DatadogAPM.externals,
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
  external: DatadogAPM.externals,
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
  external: DatadogAPM.externals,
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
  externals: DatadogAPM.externals,
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
  externals: DatadogAPM.externals,
};
```

<br></details>

## Running Your Application

Always use the `--import` flag when running your bundled application:

```bash
node --import unplugin-datadog-apm/register dist/server.js
```

For Docker deployments:

```dockerfile
CMD ["node", "--import", "unplugin-datadog-apm/register", "dist/server.js"]
```

For package.json scripts:

```json
{
  "scripts": {
    "start": "node --import unplugin-datadog-apm/register dist/server.js"
  }
}
```

## Important Notes

- **Externalize runtime deps**: Use `DatadogAPM.externals` in your bundler's external config. This exports the list of modules (`dd-trace`, `dc-polyfill`, `import-in-the-middle`, etc.) that must not be bundled for dd-trace to work correctly.
- **esbuild constraints**: See "Limitations and Caveats" for `minify`/`keepNames` requirements.
- **Plugin order**: The plugin uses `enforce: 'pre'` to run before other transforms.
- **Module detection**: The plugin uses dd-trace's internal utilities to detect which modules are instrumentable and whether they're ESM or CommonJS.
- **Git metadata**: When git metadata is available at build time, the plugin injects `DD_GIT_REPOSITORY_URL` and `DD_GIT_COMMIT_SHA` into the output banner.
- **IAST rewrite**: When `DD_IAST_ENABLED=true`, the plugin rewrites application JS files using dd-trace's IAST rewriter.

## Limitations and Caveats

### Bundler and output constraints

- **esbuild minify**: If you use `minify: true`, you must also set `keepNames: true` or the plugin will refuse to bundle (matches dd-trace expectations).
- **esbuild ESM + CJS deps**: esbuild ESM output can emit dynamic-require shims for CommonJS dependencies. Node ESM refuses to execute those shims (for example, `express`), so prefer CJS output or ensure dependencies are ESM-only.

### Instrumentation scope

- Only [modules supported by dd-trace](https://docs.datadoghq.com/tracing/trace_collection/compatibility/nodejs/) (plus `additionalModules`) are wrapped.
- Local application modules, unresolved modules, and Node built-ins are not instrumented.

### ESM proxy export detection

- Export detection is static. When parsing fails, the proxy falls back to a default export, so named exports can be incomplete.
- Dynamic imports and some `export *` chains are not intercepted.

### Worker threads

Initialization is skipped in worker threads. The main thread's tracer is inherited, but if you need custom initialization in workers, create a separate register file for them.

## Examples

See the [examples](./examples) directory for complete working examples:

- [Vite + Nitro + TanStack Start](./examples/vite-nitro-tanstack-start)
- [esbuild + Express](./examples/esbuild-express)

## How It Works

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

### The Register Helper

The `--import unplugin-datadog-apm/register` flag runs before your application loads, ensuring:

1. dd-trace initializes before any modules are imported
2. The ESM loader hook is registered via `module.register()`
3. TracerProvider is registered with the OpenTelemetry API

This approach guarantees correct initialization order regardless of bundler or output format.

## Legal

This project is [MIT](./LICENSE) licensed.

Datadog is a trademark of Datadog, Inc. This project is not affiliated with Datadog, Inc.

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/unplugin-datadog-apm.svg
[npm-version-href]: https://npmjs.com/package/unplugin-datadog-apm
[npm-downloads-src]: https://img.shields.io/npm/dm/unplugin-datadog-apm
[npm-downloads-href]: https://www.npmcharts.com/compare/unplugin-datadog-apm?interval=30
[ci-src]: https://github.com/tractorbeamai/unplugin-datadog-apm/actions/workflows/ci.yml/badge.svg
[ci-href]: https://github.com/tractorbeamai/unplugin-datadog-apm/actions/workflows/ci.yml
