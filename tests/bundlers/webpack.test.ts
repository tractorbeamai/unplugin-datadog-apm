/**
 * Tests for webpack integration.
 * Verifies CJS module wrapping and plugin functionality.
 *
 * Uses shared test helpers for common patterns (plugin metadata, excludeModules,
 * additionalModules) while keeping webpack-specific tests (function externals,
 * ESM builds, multiple modules) in this file.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import type webpack from "webpack";

import webpackPlugin from "../../src/webpack";
import {
  expectIitmProxyInjected,
  expectInstrumented,
} from "../helpers/assertions";
import { describeSharedTests } from "../helpers/bundler-tests";
import { runWebpack } from "../helpers/bundlers";
import {
  combineFixtures,
  createIoredisFixture,
  createPinoFixture,
  createUndiciFixture,
} from "../helpers/fixtures";
import { useTempDir } from "../helpers/temp-dir";
import { createFixture } from "../utils";

describe("unplugin-datadog-apm (webpack)", () => {
  const temp = useTempDir();

  // Shared tests for plugin metadata, excludeModules, and additionalModules
  describeSharedTests({
    bundlerName: "webpack",
    createPlugin: webpackPlugin,
    getTemp: () => temp,
    runExcludeModulesTest: async ({ tempDir, plugin }) => {
      await runWebpack({
        mode: "production",
        context: tempDir,
        entry: "./index.js",
        output: {
          path: path.join(tempDir, "dist"),
          filename: "bundle.js",
          library: { type: "commonjs2" },
        },
        target: "node",
        plugins: [plugin as webpack.WebpackPluginInstance],
        optimization: {
          minimize: false,
        },
        resolve: {
          modules: [path.join(tempDir, "node_modules"), "node_modules"],
        },
      });

      return readFileSync(path.join(tempDir, "dist/bundle.js"), "utf8");
    },
    runAdditionalModulesTest: async ({ tempDir, plugin }) => {
      await runWebpack({
        mode: "production",
        context: tempDir,
        entry: "./index.js",
        output: {
          path: path.join(tempDir, "dist"),
          filename: "bundle.js",
          library: { type: "commonjs2" },
        },
        target: "node",
        plugins: [plugin as webpack.WebpackPluginInstance],
        externals: ["dc-polyfill"],
        optimization: {
          minimize: false,
        },
        resolve: {
          modules: [path.join(tempDir, "node_modules"), "node_modules"],
        },
      });

      return readFileSync(path.join(tempDir, "dist/bundle.js"), "utf8");
    },
  });

  describe("CJS builds", () => {
    it("wraps CJS modules for instrumentation", async () => {
      createFixture(temp.dir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        ...createPinoFixture(),
      });

      await runWebpack({
        mode: "production",
        context: temp.dir,
        entry: "./index.js",
        output: {
          path: path.join(temp.dir, "dist"),
          filename: "bundle.js",
          library: { type: "commonjs2" },
        },
        target: "node",
        plugins: [webpackPlugin()],
        externals: ["dc-polyfill"],
        optimization: {
          minimize: false,
        },
        resolve: {
          modules: [path.join(temp.dir, "node_modules"), "node_modules"],
        },
      });

      const output = readFileSync(
        path.join(temp.dir, "dist/bundle.js"),
        "utf8",
      );

      // Should wrap CJS module with dd-trace channel
      expectInstrumented(output);
      expect(output).toContain("dc-polyfill");
    });

    it("preserves function-based externals alongside plugin externals", async () => {
      createFixture(temp.dir, {
        "index.js": `
          const pino = require('pino');
          const customExternal = require('custom-external');
          module.exports = { pino, customExternal };
        `,
        ...createPinoFixture(),
      });

      // Track which modules the externals function was called for
      const externalizedByFunction: string[] = [];

      await runWebpack({
        mode: "production",
        context: temp.dir,
        entry: "./index.js",
        output: {
          path: path.join(temp.dir, "dist"),
          filename: "bundle.js",
          library: { type: "commonjs2" },
        },
        target: "node",
        plugins: [webpackPlugin()],
        // Test with function-based externals (webpack supports this format)
        externals: [
          ({ request }, callback) => {
            if (request === "custom-external") {
              externalizedByFunction.push(request);
              callback(null, "commonjs custom-external");
              return;
            }
            callback();
          },
        ],
        optimization: {
          minimize: false,
        },
        resolve: {
          modules: [path.join(temp.dir, "node_modules"), "node_modules"],
        },
      });

      const output = readFileSync(
        path.join(temp.dir, "dist/bundle.js"),
        "utf8",
      );

      // Function-based external should still work
      expect(externalizedByFunction).toContain("custom-external");
      expect(output).toContain('require("custom-external")');

      // Plugin should still wrap instrumentable modules
      expectInstrumented(output);

      // dc-polyfill should be externalized (required for CJS wrapper)
      expect(output).toContain('require("dc-polyfill")');
    });
  });

  describe("ESM builds", () => {
    // Skip: webpack virtual modules don't work with unplugin's implementation
    // ESM proxy requires virtual modules, which unplugin-webpack handles via
    // webpack-virtual-modules, but the URL encoding causes ENOENT errors
    it.skip("creates ESM proxy for ESM modules", async () => {
      createFixture(temp.dir, {
        "index.js": `import { something } from 'undici'; export { something };`,
        ...createUndiciFixture(),
      });

      await runWebpack({
        mode: "production",
        context: temp.dir,
        entry: "./index.js",
        output: {
          path: path.join(temp.dir, "dist"),
          filename: "bundle.mjs",
          module: true,
          library: { type: "module" },
        },
        target: "node",
        plugins: [webpackPlugin()],
        externals: ["import-in-the-middle/lib/register.js"],
        experiments: {
          outputModule: true,
        },
        optimization: {
          minimize: false,
        },
        resolve: {
          modules: [path.join(temp.dir, "node_modules"), "node_modules"],
        },
      });

      const output = readFileSync(
        path.join(temp.dir, "dist/bundle.mjs"),
        "utf8",
      );

      // Should create ESM proxy with import-in-the-middle
      expectIitmProxyInjected(output);
    });

    it("respects excludeModules option", async () => {
      createFixture(temp.dir, {
        "index.js": `import { something } from 'undici'; export { something };`,
        ...createUndiciFixture(),
      });

      await runWebpack({
        mode: "production",
        context: temp.dir,
        entry: "./index.js",
        output: {
          path: path.join(temp.dir, "dist"),
          filename: "bundle.mjs",
          module: true,
          library: { type: "module" },
        },
        target: "node",
        plugins: [webpackPlugin({ excludeModules: ["undici"] })],
        experiments: {
          outputModule: true,
        },
        optimization: {
          minimize: false,
        },
        resolve: {
          modules: [path.join(temp.dir, "node_modules"), "node_modules"],
        },
      });

      const output = readFileSync(
        path.join(temp.dir, "dist/bundle.mjs"),
        "utf8",
      );

      // Should NOT create ESM proxy for excluded module
      expect(output).not.toContain("import-in-the-middle/lib/register.js");
    });

    it("wraps CJS modules in ESM output", async () => {
      createFixture(temp.dir, {
        "index.js": `import pino from 'pino'; export default pino;`,
        ...createPinoFixture(),
      });

      await runWebpack({
        mode: "production",
        context: temp.dir,
        entry: "./index.js",
        output: {
          path: path.join(temp.dir, "dist"),
          filename: "bundle.mjs",
          module: true,
          library: { type: "module" },
        },
        target: "node",
        plugins: [webpackPlugin()],
        externals: ["dc-polyfill"],
        experiments: {
          outputModule: true,
        },
        optimization: {
          minimize: false,
        },
        resolve: {
          modules: [path.join(temp.dir, "node_modules"), "node_modules"],
        },
      });

      const output = readFileSync(
        path.join(temp.dir, "dist/bundle.mjs"),
        "utf8",
      );

      // Should wrap CJS module with dd-trace channel
      expectInstrumented(output);
      expect(output).toContain("dc-polyfill");
    });
  });

  describe("multiple modules", () => {
    it("wraps multiple instrumentable modules", async () => {
      createFixture(temp.dir, {
        "index.js": `
          const pino = require('pino');
          const ioredis = require('ioredis');
          module.exports = { pino, ioredis };
        `,
        ...combineFixtures(createPinoFixture(), createIoredisFixture()),
      });

      await runWebpack({
        mode: "production",
        context: temp.dir,
        entry: "./index.js",
        output: {
          path: path.join(temp.dir, "dist"),
          filename: "bundle.js",
          library: { type: "commonjs2" },
        },
        target: "node",
        plugins: [webpackPlugin()],
        externals: ["dc-polyfill"],
        optimization: {
          minimize: false,
        },
        resolve: {
          modules: [path.join(temp.dir, "node_modules"), "node_modules"],
        },
      });

      const output = readFileSync(
        path.join(temp.dir, "dist/bundle.js"),
        "utf8",
      );

      // Should wrap both modules
      expectInstrumented(output);
      expect(output).toContain("pino");
      expect(output).toContain("ioredis");
    });
  });
});
