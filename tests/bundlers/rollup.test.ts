/**
 * Tests for Rollup bundler compatibility, output formats, and debug logging.
 */
import path from "node:path";

import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import { rollup } from "rollup";
import { describe, expect, it } from "vitest";

import rollupPlugin from "../../src/rollup";
import { expectInstrumented } from "../helpers/assertions";
import { createPinoFixture, createUndiciFixture } from "../helpers/fixtures";
import { useTempDir } from "../helpers/temp-dir";
import { createFixture } from "../utils";

describe("rollup bundler", () => {
  const temp = useTempDir();

  describe("plugin metadata", () => {
    it("rollup plugin has correct name", () => {
      const plugin = rollupPlugin();
      expect(plugin.name).toBe("unplugin-datadog-apm");
    });
  });

  describe("output formats", () => {
    it("works with CJS format", async () => {
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

      expectInstrumented(output.code);
    });

    it("works with ESM format", async () => {
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

      expect(output.code).toContain("register");
    });

    it("works with IIFE format", async () => {
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

      const result = await bundle.generate({
        format: "iife",
        name: "MyBundle",
      });
      const [output] = result.output;

      expectInstrumented(output.code);
      expect(output.code).toContain("MyBundle");
    });

    it("works with UMD format", async () => {
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

      const result = await bundle.generate({ format: "umd", name: "MyBundle" });
      const [output] = result.output;

      expectInstrumented(output.code);
      expect(output.code).toMatch(/typeof exports\s*===?\s*['"]object['"]/);
    });

    it("works with AMD format", async () => {
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

      const result = await bundle.generate({ format: "amd" });
      const [output] = result.output;

      expectInstrumented(output.code);
      expect(output.code).toContain("define");
    });

    it("generates source maps when requested", async () => {
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

      const result = await bundle.generate({ format: "cjs", sourcemap: true });
      const [output] = result.output;

      expect(output.map).toBeDefined();
    });
  });
});
