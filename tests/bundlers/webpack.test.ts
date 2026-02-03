/**
 * Tests for webpack integration.
 * Verifies CJS module wrapping and plugin functionality.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import webpack from "webpack";

import webpackPlugin from "../../src/webpack";
import {
  expectIitmProxyInjected,
  expectInstrumented,
  expectNotInstrumented,
} from "../helpers/assertions";
import { useTempDir } from "../helpers/temp-dir";
import { createFixture } from "../utils";

function runWebpack(config: webpack.Configuration): Promise<webpack.Stats> {
  return new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      if (err) {
        reject(err);
        return;
      }
      if (!stats) {
        reject(new Error("No stats returned"));
        return;
      }
      if (stats.hasErrors()) {
        const info = stats.toJson();
        reject(new Error(info.errors?.map((e) => e.message).join("\n")));
        return;
      }
      resolve(stats);
    });
  });
}

describe("unplugin-datadog-apm (webpack)", () => {
  const temp = useTempDir();

  describe("plugin metadata", () => {
    it("creates a plugin when called", () => {
      const plugin = webpackPlugin();
      expect(plugin).toBeDefined();
      expect(typeof plugin).toBe("object");
    });

    it("accepts options", () => {
      const plugin = webpackPlugin({ debug: true });
      expect(plugin).toBeDefined();
    });
  });

  describe("CJS builds", () => {
    it("wraps CJS modules for instrumentation", async () => {
      createFixture(temp.dir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          main: "index.js",
        }),
        "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
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
        plugins: [webpackPlugin({ autoInit: false })],
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

    it("respects excludeModules option", async () => {
      createFixture(temp.dir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          main: "index.js",
        }),
        "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
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
        plugins: [webpackPlugin({ autoInit: false, excludeModules: ["pino"] })],
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

      // Should NOT wrap excluded module
      expectNotInstrumented(output);
    });

    it("respects additionalModules option", async () => {
      createFixture(temp.dir, {
        "index.js": `const custom = require('custom-pkg'); module.exports = custom;`,
        "node_modules/custom-pkg/package.json": JSON.stringify({
          name: "custom-pkg",
          version: "1.0.0",
          main: "index.js",
        }),
        "node_modules/custom-pkg/index.js": `module.exports = { hello: "world" };`,
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
        plugins: [
          webpackPlugin({ autoInit: false, additionalModules: ["custom-pkg"] }),
        ],
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

      // Should wrap additional module
      expectInstrumented(output);
      expect(output).toContain("custom-pkg");
    });

    it("preserves function-based externals alongside plugin externals", async () => {
      createFixture(temp.dir, {
        "index.js": `
          const pino = require('pino');
          const customExternal = require('custom-external');
          module.exports = { pino, customExternal };
        `,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          main: "index.js",
        }),
        "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
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
        plugins: [webpackPlugin({ autoInit: false })],
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
        "node_modules/undici/package.json": JSON.stringify({
          name: "undici",
          version: "6.0.0",
          type: "module",
          main: "index.js",
        }),
        "node_modules/undici/index.js": `export const something = () => {};`,
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
        plugins: [webpackPlugin({ autoInit: false })],
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
        "node_modules/undici/package.json": JSON.stringify({
          name: "undici",
          version: "6.0.0",
          type: "module",
          main: "index.js",
        }),
        "node_modules/undici/index.js": `export const something = () => {};`,
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
        plugins: [
          webpackPlugin({ autoInit: false, excludeModules: ["undici"] }),
        ],
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
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          main: "index.js",
        }),
        "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
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
        plugins: [webpackPlugin({ autoInit: false })],
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
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          main: "index.js",
        }),
        "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
        "node_modules/ioredis/package.json": JSON.stringify({
          name: "ioredis",
          version: "5.0.0",
          main: "index.js",
        }),
        "node_modules/ioredis/index.js": `module.exports = function Redis() {};`,
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
        plugins: [webpackPlugin({ autoInit: false })],
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
