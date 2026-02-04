/**
 * Tests for rspack integration.
 * Verifies CJS module wrapping and plugin functionality.
 *
 * Uses shared test helpers for common patterns (plugin metadata, excludeModules,
 * additionalModules) while keeping rspack-specific tests (ESM builds, multiple
 * modules) in this file.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import type { RspackPluginInstance } from "@rspack/core";
import { describe, expect, it } from "vitest";

import rspackPlugin from "../../src/rspack";
import {
  expectIitmProxyInjected,
  expectInstrumented,
} from "../helpers/assertions";
import { describeSharedTests } from "../helpers/bundler-tests";
import { runRspack } from "../helpers/bundlers";
import {
  combineFixtures,
  createIoredisFixture,
  createPinoFixture,
  createUndiciFixture,
} from "../helpers/fixtures";
import { useTempDir } from "../helpers/temp-dir";
import { createFixture } from "../utils";

describe("unplugin-datadog-apm (rspack)", () => {
  const temp = useTempDir();

  describe("externals export", () => {
    it("exports externals list with RegExp patterns", () => {
      expect(rspackPlugin.externals).toBeDefined();
      expect(Array.isArray(rspackPlugin.externals)).toBe(true);
      expect(rspackPlugin.externals).toContain("dd-trace");
      expect(rspackPlugin.externals).toContain("dc-polyfill");
      expect(rspackPlugin.externals).toContain("import-in-the-middle");
      // Should include RegExp patterns for rspack
      const hasRegex = rspackPlugin.externals.some((e) => e instanceof RegExp);
      expect(hasRegex).toBe(true);
    });
  });

  // Shared tests for plugin metadata, excludeModules, and additionalModules
  describeSharedTests({
    bundlerName: "rspack",
    createPlugin: rspackPlugin,
    getTemp: () => temp,
    runExcludeModulesTest: async ({ tempDir, plugin }) => {
      await runRspack({
        mode: "production",
        entry: path.join(tempDir, "index.js"),
        output: {
          path: path.join(tempDir, "dist"),
          filename: "bundle.js",
          library: { type: "commonjs2" },
        },
        target: "node",
        plugins: [plugin as RspackPluginInstance],
        externals: rspackPlugin.externals,
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
      await runRspack({
        mode: "production",
        entry: path.join(tempDir, "index.js"),
        output: {
          path: path.join(tempDir, "dist"),
          filename: "bundle.js",
          library: { type: "commonjs2" },
        },
        target: "node",
        plugins: [plugin as RspackPluginInstance],
        externals: rspackPlugin.externals,
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

      await runRspack({
        mode: "production",
        entry: path.join(temp.dir, "index.js"),
        output: {
          path: path.join(temp.dir, "dist"),
          filename: "bundle.js",
          library: { type: "commonjs2" },
        },
        target: "node",
        plugins: [rspackPlugin()],
        externals: rspackPlugin.externals,
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
  });

  describe("ESM builds", () => {
    it("creates ESM proxy for ESM modules", async () => {
      createFixture(temp.dir, {
        "index.js": `import { something } from 'undici'; export { something };`,
        ...createUndiciFixture(),
      });

      await runRspack({
        mode: "production",
        entry: path.join(temp.dir, "index.js"),
        output: {
          path: path.join(temp.dir, "dist"),
          filename: "bundle.mjs",
          module: true,
          library: { type: "module" },
        },
        target: "node",
        plugins: [rspackPlugin()],
        externals: rspackPlugin.externals,
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

      await runRspack({
        mode: "production",
        entry: path.join(temp.dir, "index.js"),
        output: {
          path: path.join(temp.dir, "dist"),
          filename: "bundle.mjs",
          module: true,
          library: { type: "module" },
        },
        target: "node",
        plugins: [rspackPlugin({ excludeModules: ["undici"] })],
        externals: rspackPlugin.externals,
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

      await runRspack({
        mode: "production",
        entry: path.join(temp.dir, "index.js"),
        output: {
          path: path.join(temp.dir, "dist"),
          filename: "bundle.mjs",
          module: true,
          library: { type: "module" },
        },
        target: "node",
        plugins: [rspackPlugin()],
        externals: rspackPlugin.externals,
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

      await runRspack({
        mode: "production",
        entry: path.join(temp.dir, "index.js"),
        output: {
          path: path.join(temp.dir, "dist"),
          filename: "bundle.js",
          library: { type: "commonjs2" },
        },
        target: "node",
        plugins: [rspackPlugin()],
        externals: rspackPlugin.externals,
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
