# Nitro PR: Add `execArgv` Support for Dev Server Worker

This document contains all the information needed to submit a PR to [nitrojs/nitro](https://github.com/nitrojs/nitro) adding `execArgv` support for the dev server worker thread.

## Problem Statement

Nitro's dev server uses `node:worker_threads` to run the application in a separate thread. However, the worker is created without passing `execArgv`, which means Node.js CLI flags like `--import` cannot be passed to the worker.

This prevents APM/tracing tools (Datadog, OpenTelemetry, New Relic, etc.) from instrumenting the application in dev mode, since these tools require `--import` to load before any other modules.

### Current Behavior

```ts
// src/runner/node.ts (lines 119-127)
const worker = new Worker(this.#entry, {
  env: {
    ...process.env,
  },
  workerData: {
    name: this.#name,
    ...this.#data,
  },
});
```

The `Worker` constructor accepts an `execArgv` option, but it's not being used.

### Why `NODE_OPTIONS` Doesn't Work

Worker threads do **not** inherit `NODE_OPTIONS` from the parent process. From [Node.js docs](https://nodejs.org/api/worker_threads.html#new-workerfilename-options):

> `execArgv`: List of node CLI options passed to the worker. V8 options and options that affect the process (such as `--title`) are not supported. If set, this is provided as `process.execArgv` inside the worker. **By default, options are inherited from the parent thread.**

The key issue is that `--import` is a **loader** flag that must be set explicitly via `execArgv` for workers - it's not automatically inherited even when set in the parent's `process.execArgv`.

## Proposed Solution

### 1. Add `execArgv` to `EnvRunnerData` interface

**File:** `src/runner/node.ts`

```ts
export interface EnvRunnerData {
  name?: string;
  execArgv?: string[]; // NEW
  [key: string]: unknown;
}
```

### 2. Modify `NodeEnvRunner` to accept and use `execArgv`

**File:** `src/runner/node.ts`

```diff
 export class NodeEnvRunner implements EnvRunner {
   closed: boolean = false;

   #name: string;
   #entry: string;
   #data?: EnvRunnerData;
+  #execArgv?: string[];
   #hooks: Partial<WorkerHooks>;
   #worker?: Worker & { _exitCode?: number };
   #address?: WorkerAddress;
   #proxy?: HTTPProxy;
   #messageListeners: Set<(data: unknown) => void>;

-  constructor(opts: { name: string; entry: string; hooks?: WorkerHooks; data?: EnvRunnerData }) {
+  constructor(opts: { name: string; entry: string; hooks?: WorkerHooks; data?: EnvRunnerData; execArgv?: string[] }) {
     this.#name = opts.name;
     this.#entry = opts.entry;
     this.#data = opts.data;
+    this.#execArgv = opts.execArgv;
     this.#hooks = opts.hooks || {};

     this.#proxy = createHTTPProxy();
     this.#messageListeners = new Set();
     this.#initWorker();
   }
```

### 3. Pass `execArgv` to Worker constructor

**File:** `src/runner/node.ts` (in `#initWorker` method)

```diff
   #initWorker() {
     if (!existsSync(this.#entry)) {
       this.close(`worker entry not found in "${this.#entry}".`);
       return;
     }

     const worker = new Worker(this.#entry, {
       env: {
         ...process.env,
       },
+      execArgv: this.#execArgv,
       workerData: {
         name: this.#name,
         ...this.#data,
       },
     }) as Worker & { _exitCode?: number };
```

### 4. Add config option for dev server

**File:** `src/types/config.ts`

```diff
   // Dev
   dev: boolean;
   devServer: {
     port?: number;
     hostname?: string;
     watch?: string[];
+    execArgv?: string[];
   };
```

### 5. Pass `execArgv` through dev server initialization

**File:** `src/dev/server.ts`

Update the `reload()` method to pass `execArgv`:

```diff
   reload() {
     for (const worker of this.#workers) {
       worker.close();
     }
     const worker = new NodeEnvRunner({
       name: `Nitro_${this.#workerIdCtr++}`,
       entry: this.#entry,
       data: this.#workerData,
+      execArgv: this.nitro.options.devServer.execArgv,
       hooks: {
         onClose: (worker, cause) => {
```

### 6. Update Vite integration

**File:** `src/build/vite/env.ts`

The `getEnvRunner` function also creates a `NodeEnvRunner`. It should also support `execArgv`:

```diff
 export function getEnvRunner(ctx: NitroPluginContext) {
   return (ctx._envRunner ??= new NodeEnvRunner({
     name: "nitro-vite",
     entry: resolve(runtimeDir, "internal/vite/node-runner.mjs"),
     data: { server: true },
+    execArgv: ctx.nitro?.options.devServer.execArgv,
   }));
 }
```

### 7. Update hook types (optional enhancement)

**File:** `src/types/hooks.ts`

```diff
-  "dev:reload": (payload?: { entry?: string; workerData?: EnvRunnerData }) => HookResult;
+  "dev:reload": (payload?: { entry?: string; workerData?: EnvRunnerData; execArgv?: string[] }) => HookResult;
```

## Usage Example

After this change, users can configure their `nitro.config.ts`:

```ts
// nitro.config.ts
export default defineNitroConfig({
  devServer: {
    execArgv: ["--import", "./register.mjs"],
  },
});
```

Or for Nuxt users in `nuxt.config.ts`:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nitro: {
    devServer: {
      execArgv: ["--import", "./register.mjs"],
    },
  },
});
```

Or for TanStack Start users in `app.config.ts`:

```ts
// app.config.ts
import { defineConfig } from "@tanstack/react-start/config";

export default defineConfig({
  server: {
    devServer: {
      execArgv: ["--import", "./register.mjs"],
    },
  },
});
```

## Use Cases

### 1. APM/Tracing Tools

Tools like Datadog, New Relic, Dynatrace, and OpenTelemetry require early initialization via `--import` to instrument HTTP, database, and other modules before they're loaded.

```ts
devServer: {
  execArgv: ["--import", "./datadog-register.mjs"];
}
```

### 2. Custom Loaders

TypeScript loaders, module aliasing, or custom resolution:

```ts
devServer: {
  execArgv: ["--import", "tsx"];
}
```

### 3. Debugging

Node.js inspector flags:

```ts
devServer: {
  execArgv: ["--inspect", "--inspect-brk"];
}
```

### 4. Experimental Features

Enable experimental Node.js features in the worker:

```ts
devServer: {
  execArgv: ["--experimental-vm-modules"];
}
```

## Testing

### Unit Test

Add a test in `test/unit/` to verify `execArgv` is passed to the worker:

```ts
import { describe, expect, it, vi } from "vitest";

import { NodeEnvRunner } from "../../src/runner/node";

// Mock worker_threads
vi.mock("node:worker_threads", () => ({
  Worker: vi.fn().mockImplementation(() => ({
    once: vi.fn(),
    on: vi.fn(),
    postMessage: vi.fn(),
    removeAllListeners: vi.fn(),
    terminate: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe("NodeEnvRunner", () => {
  it("passes execArgv to Worker constructor", async () => {
    const { Worker } = await import("node:worker_threads");

    // Create a temp entry file for the test
    const entry = "/tmp/test-entry.mjs";
    vi.mock("node:fs", () => ({
      existsSync: () => true,
    }));

    new NodeEnvRunner({
      name: "test",
      entry,
      execArgv: ["--import", "./register.mjs"],
    });

    expect(Worker).toHaveBeenCalledWith(
      entry,
      expect.objectContaining({
        execArgv: ["--import", "./register.mjs"],
      }),
    );
  });
});
```

### Integration Test

Add or modify `test/presets/nitro-dev.test.ts` to verify the feature works end-to-end.

## PR Description Template

````markdown
## Description

Add `execArgv` support for the dev server worker thread, allowing Node.js CLI flags to be passed to the worker process.

## Motivation

APM and tracing tools (Datadog, OpenTelemetry, New Relic, etc.) require `--import` flags to load instrumentation before any other modules. Currently, there's no way to pass these flags to Nitro's dev server worker, which uses `node:worker_threads`.

Worker threads don't inherit `NODE_OPTIONS` automatically - the `execArgv` option must be explicitly passed to the `Worker` constructor.

## Changes

- Add `execArgv` option to `NodeEnvRunner` constructor
- Add `devServer.execArgv` config option
- Pass `execArgv` through Vite integration
- Update types and hooks

## Usage

```ts
// nitro.config.ts
export default defineNitroConfig({
  devServer: {
    execArgv: ["--import", "./register.mjs"],
  },
});
```
````

## Related Issues

- Enables APM tools to work in dev mode
- Requested by unplugin-datadog-apm maintainers

```

## Files to Modify (Summary)

| File | Change |
|------|--------|
| `src/runner/node.ts` | Add `execArgv` to interface, constructor, and Worker call |
| `src/types/config.ts` | Add `execArgv` to `devServer` config |
| `src/dev/server.ts` | Pass `execArgv` to `NodeEnvRunner` |
| `src/build/vite/env.ts` | Pass `execArgv` to `getEnvRunner` |
| `src/types/hooks.ts` | (Optional) Add `execArgv` to `dev:reload` hook payload |

## Alternative Considerations

### Why not use `process.execArgv` by default?

The parent process's `execArgv` could contain flags that are inappropriate for workers (like `--inspect` which would cause port conflicts). Explicit configuration is safer.

### Why not filter/sanitize parent execArgv?

This adds complexity and may break valid use cases. Explicit opt-in is cleaner.

### Could this be a Vite-level feature instead?

Vite's Environment API runs within the worker, so it can't affect how the worker is spawned. This must be at the Nitro level where the `Worker` is created.

## References

- [Node.js Worker threads documentation](https://nodejs.org/api/worker_threads.html#new-workerfilename-options)
- [Node.js --import flag documentation](https://nodejs.org/api/cli.html#--importmodule)
- [Datadog Node.js tracing setup](https://docs.datadoghq.com/tracing/trace_collection/automatic_instrumentation/dd_libraries/nodejs/)
- [OpenTelemetry Node.js setup](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/)
```
