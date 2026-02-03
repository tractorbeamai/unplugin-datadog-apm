/**
 * Tests for rspack integration.
 * Verifies CJS module wrapping and plugin functionality.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { rspack, type RspackOptions } from "@rspack/core";
import { describe, expect, it } from "vitest";

import rspackPlugin from "../../src/rspack";
import {
  expectIitmProxyInjected,
  expectInstrumented,
  expectNotInstrumented,
} from "../helpers/assertions";
import {
  combineFixtures,
  createCustomCjsFixture,
  createIoredisFixture,
  createPinoFixture,
  createUndiciFixture,
} from "../helpers/fixtures";
import { useTempDir } from "../helpers/temp-dir";
import { createFixture } from "../utils";

function runRspack(config: RspackOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    rspack(config, (err, stats) => {
      if (err) {
        reject(err);
        return;
      }
      if (stats?.hasErrors()) {
        const info = stats.toJson();
        reject(new Error(info.errors?.map((e) => e.message).join("\n")));
        return;
      }
      resolve();
    });
  });
}

describe("unplugin-datadog-apm (rspack)", () => {
  const temp = useTempDir();

  describe("plugin metadata", () => {
    it("creates a plugin when called", () => {
      const plugin = rspackPlugin();
      expect(plugin).toBeDefined();
      expect(typeof plugin).toBe("object");
    });

    it("accepts options", () => {
      const plugin = rspackPlugin({ debug: true });
      expect(plugin).toBeDefined();
    });
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
        plugins: [rspackPlugin({ autoInit: false })],
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
        plugins: [rspackPlugin({ autoInit: false, excludeModules: ["pino"] })],
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
        ...createCustomCjsFixture("custom-pkg"),
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
        plugins: [
          rspackPlugin({ autoInit: false, additionalModules: ["custom-pkg"] }),
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
        plugins: [rspackPlugin({ autoInit: false })],
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
        plugins: [
          rspackPlugin({ autoInit: false, excludeModules: ["undici"] }),
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
        plugins: [rspackPlugin({ autoInit: false })],
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

      await runRspack({
        mode: "production",
        entry: path.join(temp.dir, "index.js"),
        output: {
          path: path.join(temp.dir, "dist"),
          filename: "bundle.js",
          library: { type: "commonjs2" },
        },
        target: "node",
        plugins: [rspackPlugin({ autoInit: false })],
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
