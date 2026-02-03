import path from "node:path";

import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import { rollup } from "rollup";
import { describe, expect, it } from "vitest";

import rollupPlugin from "../../src/rollup";
import {
  createCustomEsmFixture,
  createLodashFixture,
  createPinoFixture,
  createUndiciFixture,
} from "../helpers/fixtures";
import { useTempDir } from "../helpers/temp-dir";
import { createFixture } from "../utils";

describe("output structure verification", () => {
  const temp = useTempDir();

  describe("CJS wrapper structure", () => {
    it("wraps original code in IIFE with arguments spread", async () => {
      createFixture(temp.dir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        ...createPinoFixture(),
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: temp.dir }),
          commonjs(),
        ],
        external: ["dc-polyfill"],
      });

      const result = await bundle.generate({ format: "cjs" });
      const [output] = result.output;

      // IIFE structure: (function() { ... })(); - may be nested inside commonjs wrapper
      expect(output.code).toMatch(/\(function\(\)\s*\{/);
      expect(output.code).toContain("})();");
    });

    it("requires dc-polyfill for diagnostics channel", async () => {
      createFixture(temp.dir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        ...createPinoFixture(),
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: temp.dir }),
          commonjs(),
        ],
        external: ["dc-polyfill"],
      });

      const result = await bundle.generate({ format: "cjs" });
      const [output] = result.output;

      expect(output.code).toContain("require('dc-polyfill')");
    });

    it("uses correct channel name dd-trace:bundler:load", async () => {
      createFixture(temp.dir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        ...createPinoFixture(),
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: temp.dir }),
          commonjs(),
        ],
        external: ["dc-polyfill"],
      });

      const result = await bundle.generate({ format: "cjs" });
      const [output] = result.output;

      expect(output.code).toContain("channel('dd-trace:bundler:load')");
    });

    it("includes all required payload fields", async () => {
      createFixture(temp.dir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        ...createPinoFixture(),
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: temp.dir }),
          commonjs(),
        ],
        external: ["dc-polyfill"],
      });

      const result = await bundle.generate({ format: "cjs" });
      const [output] = result.output;

      // Payload structure verification
      expect(output.code).toContain("module: mod");
      expect(output.code).toMatch(/version:\s*["']8\.0\.0["']/);
      expect(output.code).toMatch(/package:\s*["']pino["']/);
      // Path includes the resolved file path (e.g., pino/index.js)
      expect(output.code).toMatch(/path:\s*["']pino/);
    });

    it("includes correct path for submodule imports", async () => {
      createFixture(temp.dir, {
        "index.js": `const get = require('lodash/get'); module.exports = get;`,
        ...createLodashFixture(),
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: temp.dir }),
          commonjs(),
        ],
        external: ["dc-polyfill"],
      });

      const result = await bundle.generate({ format: "cjs" });
      const [output] = result.output;

      // Path should include submodule path
      expect(output.code).toMatch(/path:\s*["']lodash\/get/);
    });

    it("publishes to channel and reassigns module.exports", async () => {
      createFixture(temp.dir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        ...createPinoFixture(),
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: temp.dir }),
          commonjs(),
        ],
        external: ["dc-polyfill"],
      });

      const result = await bundle.generate({ format: "cjs" });
      const [output] = result.output;

      expect(output.code).toContain("ch.publish(payload)");
      expect(output.code).toContain("module.exports = payload.module");
    });
  });

  describe("ESM proxy structure", () => {
    it("imports register from import-in-the-middle", async () => {
      createFixture(temp.dir, {
        "index.js": `import { something } from 'undici'; export { something };`,
        ...createUndiciFixture(),
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: temp.dir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      expect(output.code).toContain(
        "import { register } from 'import-in-the-middle/lib/register.js'",
      );
    });

    it("inlines and wraps the original module exports", async () => {
      createFixture(temp.dir, {
        "index.js": `import { something } from 'undici'; export { something };`,
        ...createUndiciFixture(),
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: temp.dir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      // Rollup inlines the module, so we see the actual export being wrapped
      // with the proxy structure (setters, getters, register call)
      expect(output.code).toContain("something");
      expect(output.code).toContain("register");
    });

    it("creates Module object with Symbol.toStringTag", async () => {
      createFixture(temp.dir, {
        "index.js": `import { something } from 'undici'; export { something };`,
        ...createUndiciFixture(),
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: temp.dir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      expect(output.code).toContain("Symbol.toStringTag");
      expect(output.code).toContain("'Module'");
    });

    it("creates setter and getter objects", async () => {
      createFixture(temp.dir, {
        "index.js": `import { something } from 'undici'; export { something };`,
        ...createUndiciFixture(),
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: temp.dir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      expect(output.code).toContain("const set = {}");
      expect(output.code).toContain("const get = {}");
    });

    it("generates setter functions for exports", async () => {
      createFixture(temp.dir, {
        "index.js": `import { myExport } from 'esm-pkg'; export { myExport };`,
        ...createCustomEsmFixture(
          "esm-pkg",
          "1.0.0",
          `export const myExport = 42;`,
        ),
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false, additionalModules: ["esm-pkg"] }),
          nodeResolve({ rootDir: temp.dir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      // Setter pattern: set["exportName"] = (v) => { ... return true; };
      expect(output.code).toMatch(/set\[["'].*["']\]\s*=\s*\(v\)\s*=>/);
      expect(output.code).toContain("return true");
    });

    it("generates getter functions for exports", async () => {
      createFixture(temp.dir, {
        "index.js": `import { myExport } from 'esm-pkg'; export { myExport };`,
        ...createCustomEsmFixture(
          "esm-pkg",
          "1.0.0",
          `export const myExport = 42;`,
        ),
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false, additionalModules: ["esm-pkg"] }),
          nodeResolve({ rootDir: temp.dir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      // Getter pattern: get["exportName"] = () => variableName;
      expect(output.code).toMatch(/get\[["'].*["']\]\s*=\s*\(\)\s*=>/);
    });

    it("calls register with module URL and raw import path", async () => {
      createFixture(temp.dir, {
        "index.js": `import { something } from 'undici'; export { something };`,
        ...createUndiciFixture(),
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: temp.dir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      // register(moduleUrl, _, set, get, rawImportPath)
      expect(output.code).toMatch(/register\(["']file:\/\//);
      expect(output.code).toContain('"undici"');
    });

    it("handles modules with star re-exports", async () => {
      createFixture(temp.dir, {
        "index.js": `export * from 'esm-reexport';`,
        "node_modules/esm-reexport/package.json": JSON.stringify({
          name: "esm-reexport",
          version: "1.0.0",
          type: "module",
          main: "index.js",
        }),
        "node_modules/esm-reexport/index.js": `
          export * from './utils.js';
          export const main = true;
        `,
        "node_modules/esm-reexport/utils.js": `export const util = 1;`,
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false, additionalModules: ["esm-reexport"] }),
          nodeResolve({ rootDir: temp.dir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      // Rollup resolves star re-exports and inlines them
      // The proxy should still register and export the resolved exports
      expect(output.code).toContain("register");
      expect(output.code).toContain("main");
      expect(output.code).toContain("util");
    });
  });
});
