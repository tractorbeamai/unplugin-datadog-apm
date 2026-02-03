/**
 * Tests for ESM module proxy generation.
 * Verifies that ESM modules are wrapped with import-in-the-middle for dd-trace instrumentation.
 */
import path from "node:path";

import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import { rollup } from "rollup";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import rollupPlugin from "../../src/rollup";
import { createFixture, createTempDir } from "../utils";

describe("ESM module proxying", () => {
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

  describe("basic proxying", () => {
    it("creates ESM proxy for ESM modules", async () => {
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

      expect(output.code).toContain("import-in-the-middle/lib/register.js");
      expect(output.code).toContain("register");
    });

    it("handles .mjs files as ESM", async () => {
      createFixture(tempDir, {
        "index.js": `import { something } from 'esm-pkg'; export { something };`,
        "node_modules/esm-pkg/package.json": JSON.stringify({
          name: "esm-pkg",
          version: "1.0.0",
          main: "index.mjs",
          exports: {
            ".": "./index.mjs",
          },
        }),
        "node_modules/esm-pkg/index.mjs": `export const something = 42;`,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false, additionalModules: ["esm-pkg"] }),
          nodeResolve({ rootDir: tempDir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      expect(output.code).toContain("import-in-the-middle/lib/register.js");
    });

    it("handles mixed CJS and ESM modules in same bundle", async () => {
      createFixture(tempDir, {
        "index.js": `
          import { fetch } from 'undici';
          import pino from 'pino';
          export { fetch, pino };
        `,
        "node_modules/undici/package.json": JSON.stringify({
          name: "undici",
          version: "6.0.0",
          type: "module",
          main: "index.js",
        }),
        "node_modules/undici/index.js": `export const fetch = () => {};`,
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
        external: ["dc-polyfill", "import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      // ESM module (undici) should use import-in-the-middle
      expect(output.code).toContain("import-in-the-middle/lib/register.js");
      // CJS module (pino) should be wrapped with dc-polyfill
      expect(output.code).toContain("dc-polyfill");
      expect(output.code).toContain("dd-trace:bundler:load");
    });
  });

  describe("export parsing", () => {
    it("handles named exports in ESM proxy", async () => {
      createFixture(tempDir, {
        "index.js": `import { a, b, c } from 'esm-exports'; export { a, b, c };`,
        "node_modules/esm-exports/package.json": JSON.stringify({
          name: "esm-exports",
          version: "1.0.0",
          type: "module",
          main: "index.js",
        }),
        "node_modules/esm-exports/index.js": `
          export const a = 1;
          export const b = 2;
          export const c = 3;
        `,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false, additionalModules: ["esm-exports"] }),
          nodeResolve({ rootDir: tempDir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      expect(output.code).toContain("register");
    });

    it("handles default export in ESM proxy", async () => {
      createFixture(tempDir, {
        "index.js": `import def from 'esm-default'; export default def;`,
        "node_modules/esm-default/package.json": JSON.stringify({
          name: "esm-default",
          version: "1.0.0",
          type: "module",
          main: "index.js",
        }),
        "node_modules/esm-default/index.js": `export default function() {}`,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false, additionalModules: ["esm-default"] }),
          nodeResolve({ rootDir: tempDir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      expect(output.code).toContain("register");
      expect(output.code).toContain("default");
    });

    it("handles re-exports (export * from)", async () => {
      createFixture(tempDir, {
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
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false, additionalModules: ["esm-reexport"] }),
          nodeResolve({ rootDir: tempDir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      expect(output.code).toContain("register");
    });
  });

  describe("export declaration types", () => {
    it("handles export let declarations", async () => {
      createFixture(tempDir, {
        "index.js": `import { counter } from 'esm-let'; export { counter };`,
        "node_modules/esm-let/package.json": JSON.stringify({
          name: "esm-let",
          version: "1.0.0",
          type: "module",
          main: "index.js",
        }),
        "node_modules/esm-let/index.js": `export let counter = 0;`,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false, additionalModules: ["esm-let"] }),
          nodeResolve({ rootDir: tempDir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      expect(output.code).toContain("register");
      expect(output.code).toContain("import-in-the-middle/lib/register.js");
    });

    it("handles export var declarations", async () => {
      createFixture(tempDir, {
        "index.js": `import { legacy } from 'esm-var'; export { legacy };`,
        "node_modules/esm-var/package.json": JSON.stringify({
          name: "esm-var",
          version: "1.0.0",
          type: "module",
          main: "index.js",
        }),
        "node_modules/esm-var/index.js": `export var legacy = 'old';`,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false, additionalModules: ["esm-var"] }),
          nodeResolve({ rootDir: tempDir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      expect(output.code).toContain("register");
    });

    it("handles generator function exports", async () => {
      createFixture(tempDir, {
        "index.js": `import { gen } from 'esm-generator'; export { gen };`,
        "node_modules/esm-generator/package.json": JSON.stringify({
          name: "esm-generator",
          version: "1.0.0",
          type: "module",
          main: "index.js",
        }),
        "node_modules/esm-generator/index.js": `export function* gen() { yield 1; yield 2; }`,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false, additionalModules: ["esm-generator"] }),
          nodeResolve({ rootDir: tempDir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      expect(output.code).toContain("register");
    });

    it("handles async generator exports", async () => {
      createFixture(tempDir, {
        "index.js": `import { asyncGen } from 'esm-async-gen'; export { asyncGen };`,
        "node_modules/esm-async-gen/package.json": JSON.stringify({
          name: "esm-async-gen",
          version: "1.0.0",
          type: "module",
          main: "index.js",
        }),
        "node_modules/esm-async-gen/index.js": `export async function* asyncGen() { yield await Promise.resolve(1); }`,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false, additionalModules: ["esm-async-gen"] }),
          nodeResolve({ rootDir: tempDir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      expect(output.code).toContain("register");
    });

    it("handles class exports", async () => {
      createFixture(tempDir, {
        "index.js": `import { MyClass } from 'esm-class'; export { MyClass };`,
        "node_modules/esm-class/package.json": JSON.stringify({
          name: "esm-class",
          version: "1.0.0",
          type: "module",
          main: "index.js",
        }),
        "node_modules/esm-class/index.js": `export class MyClass { constructor() { this.value = 42; } }`,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false, additionalModules: ["esm-class"] }),
          nodeResolve({ rootDir: tempDir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      expect(output.code).toContain("register");
    });

    it("handles async function exports", async () => {
      createFixture(tempDir, {
        "index.js": `import { fetchData } from 'esm-async'; export { fetchData };`,
        "node_modules/esm-async/package.json": JSON.stringify({
          name: "esm-async",
          version: "1.0.0",
          type: "module",
          main: "index.js",
        }),
        "node_modules/esm-async/index.js": `export async function fetchData() { return await Promise.resolve('data'); }`,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false, additionalModules: ["esm-async"] }),
          nodeResolve({ rootDir: tempDir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      expect(output.code).toContain("register");
    });
  });

  describe("aliased exports", () => {
    it("handles aliased exports: export { foo as bar }", async () => {
      createFixture(tempDir, {
        "index.js": `import { bar } from 'esm-alias'; export { bar };`,
        "node_modules/esm-alias/package.json": JSON.stringify({
          name: "esm-alias",
          version: "1.0.0",
          type: "module",
          main: "index.js",
        }),
        "node_modules/esm-alias/index.js": `
          const foo = 'original';
          export { foo as bar };
        `,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false, additionalModules: ["esm-alias"] }),
          nodeResolve({ rootDir: tempDir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      expect(output.code).toContain("register");
      expect(output.code).toContain("bar");
    });

    it("handles mixed aliased exports: export { a, b as c, d }", async () => {
      createFixture(tempDir, {
        "index.js": `import { a, c, d } from 'esm-mixed-alias'; export { a, c, d };`,
        "node_modules/esm-mixed-alias/package.json": JSON.stringify({
          name: "esm-mixed-alias",
          version: "1.0.0",
          type: "module",
          main: "index.js",
        }),
        "node_modules/esm-mixed-alias/index.js": `
          const a = 1;
          const b = 2;
          const d = 4;
          export { a, b as c, d };
        `,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({
            debug: false,
            additionalModules: ["esm-mixed-alias"],
          }),
          nodeResolve({ rootDir: tempDir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      expect(output.code).toContain("register");
    });

    it("handles export from with renaming", async () => {
      createFixture(tempDir, {
        "index.js": `export { renamed } from 'esm-rename';`,
        "node_modules/esm-rename/package.json": JSON.stringify({
          name: "esm-rename",
          version: "1.0.0",
          type: "module",
          main: "index.js",
        }),
        "node_modules/esm-rename/index.js": `
          const original = 'value';
          export { original as renamed };
        `,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false, additionalModules: ["esm-rename"] }),
          nodeResolve({ rootDir: tempDir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      expect(output.code).toContain("register");
      expect(output.code).toContain("renamed");
    });
  });

  describe("complex exports", () => {
    it("handles multiple export types in same module", async () => {
      createFixture(tempDir, {
        "index.js": `
          import { MyClass, gen, counter, fetchData, aliased } from 'esm-complex';
          export { MyClass, gen, counter, fetchData, aliased };
        `,
        "node_modules/esm-complex/package.json": JSON.stringify({
          name: "esm-complex",
          version: "1.0.0",
          type: "module",
          main: "index.js",
        }),
        "node_modules/esm-complex/index.js": `
          export class MyClass {}
          export function* gen() { yield 1; }
          export let counter = 0;
          export async function fetchData() { return 'data'; }
          const original = 'value';
          export { original as aliased };
        `,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false, additionalModules: ["esm-complex"] }),
          nodeResolve({ rootDir: tempDir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      expect(output.code).toContain("register");
    });

    it("handles export with computed property names", async () => {
      createFixture(tempDir, {
        "index.js": `import def from 'esm-computed'; export default def;`,
        "node_modules/esm-computed/package.json": JSON.stringify({
          name: "esm-computed",
          version: "1.0.0",
          type: "module",
          main: "index.js",
        }),
        "node_modules/esm-computed/index.js": `
          const key = 'value';
          export default { [key]: 42 };
        `,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false, additionalModules: ["esm-computed"] }),
          nodeResolve({ rootDir: tempDir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      expect(output.code).toContain("register");
    });
  });

  describe("destructuring exports", () => {
    it("handles object destructuring exports", async () => {
      createFixture(tempDir, {
        "index.js": `import { a, b } from 'esm-destructure'; export { a, b };`,
        "node_modules/esm-destructure/package.json": JSON.stringify({
          name: "esm-destructure",
          version: "1.0.0",
          type: "module",
          main: "index.js",
        }),
        "node_modules/esm-destructure/index.js": `
          const obj = { a: 1, b: 2, c: 3 };
          export const { a, b } = obj;
        `,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({
            debug: false,
            additionalModules: ["esm-destructure"],
          }),
          nodeResolve({ rootDir: tempDir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      expect(output.code).toContain("register");
      expect(output.code).toContain("export");
    });

    it("handles array destructuring exports", async () => {
      createFixture(tempDir, {
        "index.js": `import { first, second } from 'esm-array'; export { first, second };`,
        "node_modules/esm-array/package.json": JSON.stringify({
          name: "esm-array",
          version: "1.0.0",
          type: "module",
          main: "index.js",
        }),
        "node_modules/esm-array/index.js": `
          const arr = [1, 2, 3];
          export const [first, second] = arr;
        `,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false, additionalModules: ["esm-array"] }),
          nodeResolve({ rootDir: tempDir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      expect(output.code).toContain("register");
    });
  });

  describe("known limitations", () => {
    it("does NOT instrument dynamic imports (expected limitation)", async () => {
      createFixture(tempDir, {
        "index.js": `
          export async function loadPino() {
            const pino = await import('pino');
            return pino;
          }
        `,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          type: "module",
          main: "index.js",
        }),
        "node_modules/pino/index.js": `export const log = () => {};`,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: tempDir }),
        ],
        external: ["import-in-the-middle/lib/register.js", "pino"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      // Dynamic imports are kept as-is, not instrumented at build time
      expect(output.code).toContain("import('pino')");
      expect(output.code).not.toContain("register");
    });
  });
});
