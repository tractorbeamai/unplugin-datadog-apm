/**
 * Runtime verification tests for all bundlers.
 * Verifies that dd-trace auto-instrumentation works without --import flag.
 *
 * Uses a shared express health check fixture to test each bundler's output.
 * No manual externals - the plugin should auto-externalize everything needed.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import { rspack, type RspackOptions } from "@rspack/core";
import * as esbuild from "esbuild";
import { rolldown } from "rolldown";
import { rollup, type InputPluginOption } from "rollup";
import { build as viteBuild } from "vite";
import { describe, expect, it } from "vitest";
import webpack from "webpack";

import esbuildPlugin from "../../src/esbuild";
import rolldownPlugin from "../../src/rolldown";
import rollupPlugin from "../../src/rollup";
import rspackPlugin from "../../src/rspack";
import vitePlugin from "../../src/vite";
import webpackPlugin from "../../src/webpack";
import { useRuntimeTempDir } from "../helpers/temp-dir";
import { fetchHealth, startServer, stopServer } from "../utils";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, "../fixtures/express-health-server");
const CJS_FIXTURE = path.join(FIXTURE_DIR, "server.cjs");
const ESM_FIXTURE = path.join(FIXTURE_DIR, "server.mjs");

const jsonPlugin = json as unknown as () => unknown;

interface WebpackStatsLike {
  hasErrors: () => boolean;
  toString: () => string;
}

type WebpackInvoker = (
  config: webpack.Configuration,
  callback: (err?: Error | null, stats?: WebpackStatsLike) => void,
) => void;

function runWebpack(config: webpack.Configuration): Promise<void> {
  const invokeWebpack = webpack as unknown as WebpackInvoker;

  return new Promise((resolve, reject) => {
    invokeWebpack(config, (err, stats) => {
      if (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      if (!stats) {
        reject(new Error("No stats returned"));
        return;
      }
      if (stats.hasErrors()) {
        reject(new Error(stats.toString()));
        return;
      }
      resolve();
    });
  });
}

interface RspackStatsLike {
  hasErrors: () => boolean;
  toString: () => string;
}
type RspackInvoker = (
  config: RspackOptions,
  callback: (err?: Error | null, stats?: RspackStatsLike) => void,
) => void;

function runRspack(config: RspackOptions): Promise<void> {
  const invokeRspack = rspack as unknown as RspackInvoker;

  return new Promise((resolve, reject) => {
    invokeRspack(config, (err, stats) => {
      if (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      if (stats?.hasErrors()) {
        reject(new Error(stats.toString()));
        return;
      }
      resolve();
    });
  });
}

describe("runtime verification", () => {
  const temp = useRuntimeTempDir();

  describe("esbuild", () => {
    it("CJS: captures traces without --import flag", async () => {
      const inputPath = path.join(temp.dir, "server.cjs");
      const outputPath = path.join(temp.dir, "dist/server.cjs");

      copyFileSync(CJS_FIXTURE, inputPath);

      await esbuild.build({
        entryPoints: [inputPath],
        bundle: true,
        platform: "node",
        format: "cjs",
        outfile: outputPath,
        plugins: [esbuildPlugin()],
      });

      const { proc, port } = await startServer(outputPath);
      try {
        const health = await fetchHealth(port);
        expect(health.hasActiveSpan).toBe(true);
        expect(health.traceId).toBeDefined();
        expect(health.spanId).toBeDefined();
      } finally {
        await stopServer(proc);
      }
    }, 15_000);

    it("ESM: captures traces without --import flag", async () => {
      const inputPath = path.join(temp.dir, "server.mjs");
      const outputPath = path.join(temp.dir, "dist/server.mjs");

      copyFileSync(ESM_FIXTURE, inputPath);

      await esbuild.build({
        entryPoints: [inputPath],
        bundle: true,
        platform: "node",
        format: "esm",
        outfile: outputPath,
        plugins: [esbuildPlugin()],
      });

      const { proc, port } = await startServer(outputPath);
      try {
        const health = await fetchHealth(port);
        expect(health.hasActiveSpan).toBe(true);
        expect(health.traceId).toBeDefined();
        expect(health.spanId).toBeDefined();
      } finally {
        await stopServer(proc);
      }
    }, 15_000);
  });

  describe("rollup", () => {
    it("CJS: captures traces without --import flag", async () => {
      const inputPath = path.join(temp.dir, "server.cjs");
      const outputPath = path.join(temp.dir, "dist/server.cjs");

      copyFileSync(CJS_FIXTURE, inputPath);
      mkdirSync(path.dirname(outputPath), { recursive: true });

      const bundle = await rollup({
        input: inputPath,
        plugins: [rollupPlugin()],
      });

      await bundle.write({
        file: outputPath,
        format: "cjs",
      });

      const { proc, port } = await startServer(outputPath);
      try {
        const health = await fetchHealth(port);
        expect(health.hasActiveSpan).toBe(true);
        expect(health.traceId).toBeDefined();
        expect(health.spanId).toBeDefined();
      } finally {
        await stopServer(proc);
      }
    }, 15_000);

    it("ESM: captures traces without --import flag", async () => {
      const inputPath = path.join(temp.dir, "server.mjs");
      const outputDir = path.join(temp.dir, "dist");
      const outputPath = path.join(outputDir, "server.mjs");

      copyFileSync(ESM_FIXTURE, inputPath);
      mkdirSync(outputDir, { recursive: true });

      const bundle = await rollup({
        input: inputPath,
        plugins: [
          nodeResolve({ preferBuiltins: true }),
          commonjs(),
          jsonPlugin(),
          rollupPlugin(),
        ] as unknown as InputPluginOption,
      });

      await bundle.write({
        dir: outputDir,
        format: "es",
        entryFileNames: "[name].mjs",
        chunkFileNames: "[name]-[hash].mjs",
      });

      const { proc, port } = await startServer(outputPath);
      try {
        const health = await fetchHealth(port);
        expect(health.hasActiveSpan).toBe(true);
        expect(health.traceId).toBeDefined();
        expect(health.spanId).toBeDefined();
      } finally {
        await stopServer(proc);
      }
    }, 15_000);
  });

  describe("rolldown", () => {
    // Note: rolldown CJS format wraps CJS source code in lazy functions that
    // aren't executed for side-effect-only scripts. We use ESM source for both
    // output formats to ensure the code runs immediately.

    it("CJS output: captures traces without --import flag", async () => {
      const inputPath = path.join(temp.dir, "server.mjs");
      const outputPath = path.join(temp.dir, "dist/server.cjs");

      copyFileSync(ESM_FIXTURE, inputPath);

      const bundle = await rolldown({
        input: inputPath,
        plugins: [rolldownPlugin()],
      });

      await bundle.write({
        dir: path.dirname(outputPath),
        format: "cjs",
        entryFileNames: "[name].cjs",
        chunkFileNames: "[name]-[hash].cjs",
      });

      const { proc, port } = await startServer(outputPath);
      try {
        const health = await fetchHealth(port);
        expect(health.hasActiveSpan).toBe(true);
        expect(health.traceId).toBeDefined();
        expect(health.spanId).toBeDefined();
      } finally {
        await stopServer(proc);
      }
    }, 15_000);

    it("ESM output: captures traces without --import flag", async () => {
      const inputPath = path.join(temp.dir, "server.mjs");
      const outputPath = path.join(temp.dir, "dist/server.mjs");

      copyFileSync(ESM_FIXTURE, inputPath);

      const bundle = await rolldown({
        input: inputPath,
        platform: "node",
        plugins: [rolldownPlugin()],
      });

      await bundle.write({
        dir: path.dirname(outputPath),
        format: "esm",
        entryFileNames: "[name].mjs",
        chunkFileNames: "[name]-[hash].mjs",
      });

      const { proc, port } = await startServer(outputPath);
      try {
        const health = await fetchHealth(port);
        expect(health.hasActiveSpan).toBe(true);
        expect(health.traceId).toBeDefined();
        expect(health.spanId).toBeDefined();
      } finally {
        await stopServer(proc);
      }
    }, 15_000);
  });

  describe("webpack", () => {
    it("CJS: captures traces without --import flag", async () => {
      const inputPath = path.join(temp.dir, "server.js");
      const outputPath = path.join(temp.dir, "dist/server.cjs");

      copyFileSync(CJS_FIXTURE, inputPath);

      await runWebpack({
        mode: "production",
        entry: inputPath,
        output: {
          path: path.dirname(outputPath),
          filename: "server.cjs",
          library: { type: "commonjs2" },
        },
        target: "node",
        plugins: [webpackPlugin()],
        optimization: { minimize: false },
      });

      const { proc, port } = await startServer(outputPath);
      try {
        const health = await fetchHealth(port);
        expect(health.hasActiveSpan).toBe(true);
        expect(health.traceId).toBeDefined();
        expect(health.spanId).toBeDefined();
      } finally {
        await stopServer(proc);
      }
    }, 15_000);

    // KNOWN LIMITATION: ESM output from webpack does not support automatic
    // dd-trace instrumentation without the --import flag.
    //
    // Root cause: Webpack resolves external modules at bundle load time, before
    // any application code runs. Even with externalsType: 'import' (which uses
    // dynamic import() syntax), webpack's runtime awaits these imports
    // synchronously during module initialization.
    //
    // This means the ESM loader hook (import-in-the-middle) cannot intercept
    // the imports because they're resolved before the hook is registered.
    //
    // Workarounds investigated (none work):
    // - externalsType: 'import' - Still resolves at load time
    // - externalsType: 'module-import' - Uses static imports for import statements
    //
    // Solution: For ESM output from webpack/rspack, use the --import flag:
    //   node --import dd-trace/initialize dist/server.mjs
    //
    // CJS output works without --import because the CJS wrapper code intercepts
    // require() calls at runtime.
    it.skip("ESM: captures traces without --import flag", async () => {
      const inputPath = path.join(temp.dir, "server.mjs");
      const outputPath = path.join(temp.dir, "dist/server.mjs");

      copyFileSync(ESM_FIXTURE, inputPath);

      await runWebpack({
        mode: "production",
        entry: inputPath,
        output: {
          path: path.dirname(outputPath),
          filename: "server.mjs",
          module: true,
          library: { type: "module" },
        },
        target: "node",
        plugins: [webpackPlugin()],
        experiments: { outputModule: true },
        optimization: { minimize: false },
      });

      const { proc, port } = await startServer(outputPath);
      try {
        const health = await fetchHealth(port);
        expect(health.hasActiveSpan).toBe(true);
        expect(health.traceId).toBeDefined();
        expect(health.spanId).toBeDefined();
      } finally {
        await stopServer(proc);
      }
    }, 15_000);
  });

  describe("rspack", () => {
    it("CJS: captures traces without --import flag", async () => {
      const inputPath = path.join(temp.dir, "server.js");
      const outputPath = path.join(temp.dir, "dist/server.cjs");

      copyFileSync(CJS_FIXTURE, inputPath);

      await runRspack({
        mode: "production",
        entry: inputPath,
        output: {
          path: path.dirname(outputPath),
          filename: "server.cjs",
          library: { type: "commonjs2" },
        },
        target: "node",
        plugins: [rspackPlugin()],
        optimization: { minimize: false },
      });

      const { proc, port } = await startServer(outputPath);
      try {
        const health = await fetchHealth(port);
        expect(health.hasActiveSpan).toBe(true);
        expect(health.traceId).toBeDefined();
        expect(health.spanId).toBeDefined();
      } finally {
        await stopServer(proc);
      }
    }, 15_000);

    // KNOWN LIMITATION: Same as webpack - rspack resolves external modules at
    // bundle load time. See the webpack ESM test comment above for full details.
    //
    // Solution: For ESM output from rspack, use the --import flag:
    //   node --import dd-trace/initialize dist/server.mjs
    it.skip("ESM: captures traces without --import flag", async () => {
      const inputPath = path.join(temp.dir, "server.mjs");
      const outputPath = path.join(temp.dir, "dist/server.mjs");

      copyFileSync(ESM_FIXTURE, inputPath);

      await runRspack({
        mode: "production",
        entry: inputPath,
        output: {
          path: path.dirname(outputPath),
          filename: "server.mjs",
          module: true,
          library: { type: "module" },
        },
        target: "node",
        plugins: [rspackPlugin()],
        experiments: { outputModule: true },
        optimization: { minimize: false },
      });

      const { proc, port } = await startServer(outputPath);
      try {
        const health = await fetchHealth(port);
        expect(health.hasActiveSpan).toBe(true);
        expect(health.traceId).toBeDefined();
        expect(health.spanId).toBeDefined();
      } finally {
        await stopServer(proc);
      }
    }, 15_000);
  });

  describe("vite", () => {
    it("ESM: captures traces without --import flag", async () => {
      const inputPath = path.join(temp.dir, "server.mjs");

      copyFileSync(ESM_FIXTURE, inputPath);

      await viteBuild({
        root: temp.dir,
        logLevel: "silent",
        build: {
          write: true,
          outDir: path.join(temp.dir, "dist"),
          ssr: true,
          target: "node20",
          rollupOptions: {
            input: inputPath,
            output: {
              entryFileNames: "server.mjs",
              format: "es",
            },
          },
        },
        ssr: {
          target: "node",
          noExternal: true,
        },
        plugins: [vitePlugin()],
      });

      const outputPath = path.join(temp.dir, "dist/server.mjs");

      const { proc, port } = await startServer(outputPath);
      try {
        const health = await fetchHealth(port);
        expect(health.hasActiveSpan).toBe(true);
        expect(health.traceId).toBeDefined();
        expect(health.spanId).toBeDefined();
      } finally {
        await stopServer(proc);
      }
    }, 15_000);
  });
});
