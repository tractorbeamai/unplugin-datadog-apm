/**
 * Runtime verification tests for all bundlers.
 * Verifies that dd-trace auto-instrumentation works with --import flag.
 *
 * These tests confirm that @opentelemetry/api integration works:
 * - trace.getActiveSpan() returns active dd-trace spans
 * - span.spanContext() provides traceId and spanId
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
import * as esbuild from "esbuild";
import { rolldown } from "rolldown";
import { rollup, type InputPluginOption } from "rollup";
import { build as viteBuild } from "vite";
import { describe, expect, it } from "vitest";

import esbuildPlugin from "../../src/esbuild";
import rolldownPlugin from "../../src/rolldown";
import rollupPlugin from "../../src/rollup";
import rspackPlugin from "../../src/rspack";
import vitePlugin from "../../src/vite";
import webpackPlugin from "../../src/webpack";
import { runRspack, runWebpack } from "../helpers/bundlers";
import { useRuntimeTempDir } from "../helpers/temp-dir";
import { fetchHealth, startServer, stopServer } from "../utils";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, "../fixtures/express-health-server");
const CJS_FIXTURE = path.join(FIXTURE_DIR, "server.cjs");
const ESM_FIXTURE = path.join(FIXTURE_DIR, "server.mjs");

const jsonPlugin = json as unknown as () => unknown;

describe("runtime verification", () => {
  const temp = useRuntimeTempDir();

  describe("esbuild", () => {
    it("CJS: captures traces with --import flag", async () => {
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

    // KNOWN LIMITATION: esbuild ESM bundles can emit dynamic require shims for
    // CJS dependencies (e.g. express), which Node ESM refuses to execute.
    it.skip("ESM: captures traces with --import flag", async () => {
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
    it("CJS: captures traces with --import flag", async () => {
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

    it("ESM: captures traces with --import flag", async () => {
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

    it("CJS output: captures traces with --import flag", async () => {
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

    it("ESM output: captures traces with --import flag", async () => {
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
    it("CJS: captures traces with --import flag", async () => {
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

    it("ESM: captures traces with --import flag", async () => {
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
    it("CJS: captures traces with --import flag", async () => {
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

    it("ESM: captures traces with --import flag", async () => {
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
    it("ESM: captures traces with --import flag", async () => {
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
