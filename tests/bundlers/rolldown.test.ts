/**
 * Tests for rolldown integration.
 * Rolldown is a Rollup-compatible bundler written in Rust.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { rolldown } from "rolldown";
import { describe, expect, it } from "vitest";

import rolldownPlugin from "../../src/rolldown";
import {
  expectIitmProxyInjected,
  expectInstrumented,
  expectNotInstrumented,
} from "../helpers/assertions";
import { useTempDir } from "../helpers/temp-dir";
import { createFixture } from "../utils";

describe("unplugin-datadog-apm (rolldown)", () => {
  const temp = useTempDir();

  describe("plugin metadata", () => {
    it("creates a plugin with correct name", () => {
      const plugin = rolldownPlugin();
      expect(plugin.name).toBe("unplugin-datadog-apm");
    });

    it("accepts options", () => {
      const plugin = rolldownPlugin({ debug: true });
      expect(plugin).toBeDefined();
    });
  });

  describe("CJS builds", () => {
    it("wraps CJS modules for instrumentation", async () => {
      createFixture(temp.dir, {
        "index.js": `import pino from 'pino'; export default pino;`,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          main: "index.js",
        }),
        "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
      });

      const bundle = await rolldown({
        input: path.join(temp.dir, "index.js"),
        plugins: [rolldownPlugin({ autoInit: false })],
        external: ["dc-polyfill"],
        resolve: {
          modules: [path.join(temp.dir, "node_modules")],
        },
      });

      await bundle.write({
        dir: path.join(temp.dir, "dist"),
        format: "cjs",
      });

      const output = readFileSync(path.join(temp.dir, "dist/index.js"), "utf8");

      // Should wrap CJS module with dd-trace channel
      expectInstrumented(output);
      expect(output).toContain("dc-polyfill");
    });

    it("respects excludeModules option", async () => {
      createFixture(temp.dir, {
        "index.js": `import pino from 'pino'; export default pino;`,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          main: "index.js",
        }),
        "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
      });

      const bundle = await rolldown({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rolldownPlugin({ autoInit: false, excludeModules: ["pino"] }),
        ],
        resolve: {
          modules: [path.join(temp.dir, "node_modules")],
        },
      });

      await bundle.write({
        dir: path.join(temp.dir, "dist"),
        format: "cjs",
      });

      const output = readFileSync(path.join(temp.dir, "dist/index.js"), "utf8");

      // Should NOT wrap excluded module
      expectNotInstrumented(output);
    });

    it("respects additionalModules option", async () => {
      createFixture(temp.dir, {
        "index.js": `import custom from 'custom-pkg'; export default custom;`,
        "node_modules/custom-pkg/package.json": JSON.stringify({
          name: "custom-pkg",
          version: "1.0.0",
          main: "index.js",
        }),
        "node_modules/custom-pkg/index.js": `module.exports = { hello: "world" };`,
      });

      const bundle = await rolldown({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rolldownPlugin({
            autoInit: false,
            additionalModules: ["custom-pkg"],
          }),
        ],
        external: ["dc-polyfill"],
        resolve: {
          modules: [path.join(temp.dir, "node_modules")],
        },
      });

      await bundle.write({
        dir: path.join(temp.dir, "dist"),
        format: "cjs",
      });

      const output = readFileSync(path.join(temp.dir, "dist/index.js"), "utf8");

      // Should wrap additional module
      expectInstrumented(output);
      expect(output).toContain("custom-pkg");
    });
  });

  describe("ESM builds", () => {
    it("creates ESM proxy for ESM modules", async () => {
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

      const bundle = await rolldown({
        input: path.join(temp.dir, "index.js"),
        plugins: [rolldownPlugin({ autoInit: false })],
        external: ["import-in-the-middle/lib/register.js"],
        resolve: {
          modules: [path.join(temp.dir, "node_modules")],
        },
      });

      await bundle.write({
        dir: path.join(temp.dir, "dist"),
        format: "esm",
      });

      const output = readFileSync(path.join(temp.dir, "dist/index.js"), "utf8");

      // Should create ESM proxy with import-in-the-middle
      expectIitmProxyInjected(output);
    });
  });

  describe("output formats", () => {
    it("works with ESM format", async () => {
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

      const bundle = await rolldown({
        input: path.join(temp.dir, "index.js"),
        plugins: [rolldownPlugin({ autoInit: false })],
        external: ["import-in-the-middle/lib/register.js"],
        resolve: {
          modules: [path.join(temp.dir, "node_modules")],
        },
      });

      await bundle.write({
        dir: path.join(temp.dir, "dist"),
        format: "esm",
      });

      const output = readFileSync(path.join(temp.dir, "dist/index.js"), "utf8");
      expect(output).toContain("register");
    });

    it("works with CJS format", async () => {
      createFixture(temp.dir, {
        "index.js": `import pino from 'pino'; export default pino;`,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          main: "index.js",
        }),
        "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
      });

      const bundle = await rolldown({
        input: path.join(temp.dir, "index.js"),
        plugins: [rolldownPlugin({ autoInit: false })],
        external: ["dc-polyfill"],
        resolve: {
          modules: [path.join(temp.dir, "node_modules")],
        },
      });

      await bundle.write({
        dir: path.join(temp.dir, "dist"),
        format: "cjs",
      });

      const output = readFileSync(path.join(temp.dir, "dist/index.js"), "utf8");
      expectInstrumented(output);
    });
  });
});
