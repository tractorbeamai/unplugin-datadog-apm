/**
 * Tests for bundler compatibility and entry files.
 * Verifies all bundler entry exports, plugin metadata, debug logging, and output formats.
 */
import path from "node:path";

import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import { rollup } from "rollup";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import esbuildPlugin from "../src/esbuild";
import farmPlugin from "../src/farm";
import rolldownPlugin from "../src/rolldown";
import rollupPlugin from "../src/rollup";
import rspackPlugin from "../src/rspack";
import vitePlugin from "../src/vite";
import webpackPlugin from "../src/webpack";
import { createFixture, createTempDir } from "./utils";

describe("bundler compatibility", () => {
  describe("entry file exports", () => {
    describe("webpack entry", () => {
      it("exports a function", () => {
        expect(typeof webpackPlugin).toBe("function");
      });

      it("returns a plugin when called", () => {
        expect(webpackPlugin()).toBeDefined();
        expect(typeof webpackPlugin()).toBe("object");
      });

      it("accepts options", () => {
        expect(webpackPlugin({ debug: true })).toBeDefined();
      });
    });

    describe("esbuild entry", () => {
      it("exports a function", () => {
        expect(typeof esbuildPlugin).toBe("function");
      });

      it("returns a plugin when called", () => {
        expect(esbuildPlugin()).toBeDefined();
        expect(typeof esbuildPlugin()).toBe("object");
      });

      it("plugin has name property", () => {
        const plugin = esbuildPlugin() as { name: string };
        expect(plugin.name).toBe("unplugin-datadog-apm");
      });

      it("accepts options", () => {
        expect(
          esbuildPlugin({ debug: true, additionalModules: ["custom"] }),
        ).toBeDefined();
      });
    });

    describe("rspack entry", () => {
      it("exports a function", () => {
        expect(typeof rspackPlugin).toBe("function");
      });

      it("returns a plugin when called", () => {
        expect(rspackPlugin()).toBeDefined();
        expect(typeof rspackPlugin()).toBe("object");
      });

      it("accepts options", () => {
        expect(rspackPlugin({ excludeModules: ["pino"] })).toBeDefined();
      });
    });

    describe("rolldown entry", () => {
      it("exports a function", () => {
        expect(typeof rolldownPlugin).toBe("function");
      });

      it("returns a plugin when called", () => {
        expect(rolldownPlugin()).toBeDefined();
        expect(typeof rolldownPlugin()).toBe("object");
      });

      it("plugin has name property", () => {
        const plugin = rolldownPlugin() as { name: string };
        expect(plugin.name).toBe("unplugin-datadog-apm");
      });

      it("accepts options", () => {
        expect(rolldownPlugin({ debug: false })).toBeDefined();
      });
    });

    describe("farm entry", () => {
      it("exports a function", () => {
        expect(typeof farmPlugin).toBe("function");
      });

      it("returns a plugin when called", () => {
        expect(farmPlugin()).toBeDefined();
        expect(typeof farmPlugin()).toBe("object");
      });

      it("plugin has name property", () => {
        const plugin = farmPlugin() as { name: string };
        expect(plugin.name).toBe("unplugin-datadog-apm");
      });

      it("accepts options", () => {
        expect(
          farmPlugin({
            additionalModules: ["my-pkg"],
            excludeModules: ["other-pkg"],
          }),
        ).toBeDefined();
      });
    });

    describe("all entries", () => {
      it("non-webpack plugins have the same name", () => {
        const esbuild = esbuildPlugin() as { name: string };
        const rolldown = rolldownPlugin() as { name: string };
        const farm = farmPlugin() as { name: string };

        expect(esbuild.name).toBe("unplugin-datadog-apm");
        expect(rolldown.name).toBe("unplugin-datadog-apm");
        expect(farm.name).toBe("unplugin-datadog-apm");
      });

      it("webpack and rspack return plugin objects", () => {
        expect(webpackPlugin()).toBeDefined();
        expect(rspackPlugin()).toBeDefined();
      });
    });
  });

  describe("plugin metadata", () => {
    it("rollup plugin has correct name", () => {
      const plugin = rollupPlugin();
      expect(plugin.name).toBe("unplugin-datadog-apm");
    });

    it("vite plugin has correct name", () => {
      const plugin = vitePlugin();
      expect(plugin.name).toBe("unplugin-datadog-apm");
    });

    it("vite plugin has enforce: pre", () => {
      const plugin = vitePlugin();
      expect(plugin.enforce).toBe("pre");
    });
  });

  describe("debug logging", () => {
    let tempDir: string;
    let cleanup: () => void;

    beforeEach(() => {
      const temp = createTempDir();
      tempDir = temp.tempDir;
      cleanup = temp.cleanup;
    });

    afterEach(() => {
      cleanup();
    });

    it("logs when debug is enabled", async () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      createFixture(tempDir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          main: "index.js",
        }),
        "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({ debug: true }),
          nodeResolve({ rootDir: tempDir }),
          commonjs(),
        ],
        external: ["dc-polyfill"],
      });

      await bundle.generate({ format: "cjs" });

      const datadogLogs = consoleSpy.mock.calls.filter(
        (call) => typeof call[0] === "string" && call[0].includes("[datadog]"),
      );
      expect(datadogLogs.length).toBeGreaterThan(0);

      consoleSpy.mockRestore();
    });

    it("does not log when debug is disabled", async () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      createFixture(tempDir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          main: "index.js",
        }),
        "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: tempDir }),
          commonjs(),
        ],
        external: ["dc-polyfill"],
      });

      await bundle.generate({ format: "cjs" });

      const datadogLogs = consoleSpy.mock.calls.filter(
        (call) => typeof call[0] === "string" && call[0].includes("[datadog]"),
      );
      expect(datadogLogs.length).toBe(0);

      consoleSpy.mockRestore();
    });
  });

  describe("output formats", () => {
    let tempDir: string;
    let cleanup: () => void;

    beforeEach(() => {
      const temp = createTempDir();
      tempDir = temp.tempDir;
      cleanup = temp.cleanup;
    });

    afterEach(() => {
      cleanup();
    });

    it("works with CJS format", async () => {
      createFixture(tempDir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          main: "index.js",
        }),
        "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: tempDir }),
          commonjs(),
        ],
        external: ["dc-polyfill"],
      });

      const result = await bundle.generate({ format: "cjs" });
      const [output] = result.output;

      expect(output.code).toContain("dd-trace:bundler:load");
    });

    it("works with ESM format", async () => {
      createFixture(tempDir, {
        "index.js": `import { something } from 'undici'; export { something };`,
        "node_modules/undici/package.json": JSON.stringify({
          name: "undici",
          version: "6.0.0",
          type: "module",
          main: "index.js",
        }),
        "node_modules/undici/index.js": `export const something = () => {};`,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: tempDir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      expect(output.code).toContain("register");
    });

    it("works with IIFE format", async () => {
      createFixture(tempDir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          main: "index.js",
        }),
        "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: tempDir }),
          commonjs(),
        ],
        external: ["dc-polyfill"],
      });

      const result = await bundle.generate({
        format: "iife",
        name: "MyBundle",
      });
      const [output] = result.output;

      expect(output.code).toContain("dd-trace:bundler:load");
      expect(output.code).toContain("MyBundle");
    });

    it("works with UMD format", async () => {
      createFixture(tempDir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          main: "index.js",
        }),
        "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: tempDir }),
          commonjs(),
        ],
        external: ["dc-polyfill"],
      });

      const result = await bundle.generate({ format: "umd", name: "MyBundle" });
      const [output] = result.output;

      expect(output.code).toContain("dd-trace:bundler:load");
      expect(output.code).toMatch(/typeof exports\s*===?\s*['"]object['"]/);
    });

    it("works with AMD format", async () => {
      createFixture(tempDir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          main: "index.js",
        }),
        "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: tempDir }),
          commonjs(),
        ],
        external: ["dc-polyfill"],
      });

      const result = await bundle.generate({ format: "amd" });
      const [output] = result.output;

      expect(output.code).toContain("dd-trace:bundler:load");
      expect(output.code).toContain("define");
    });

    it("generates source maps when requested", async () => {
      createFixture(tempDir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          main: "index.js",
        }),
        "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: tempDir }),
          commonjs(),
        ],
        external: ["dc-polyfill"],
      });

      const result = await bundle.generate({ format: "cjs", sourcemap: true });
      const [output] = result.output;

      expect(output.map).toBeDefined();
    });
  });
});
