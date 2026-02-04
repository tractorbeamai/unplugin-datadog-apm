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

  describe("externals export", () => {
    it("exports externals list with RegExp patterns", () => {
      expect(rollupPlugin.externals).toBeDefined();
      expect(Array.isArray(rollupPlugin.externals)).toBe(true);
      expect(rollupPlugin.externals).toContain("dd-trace");
      expect(rollupPlugin.externals).toContain("dc-polyfill");
      expect(rollupPlugin.externals).toContain("import-in-the-middle");
      // Should include RegExp patterns for rollup
      const hasRegex = rollupPlugin.externals.some((e) => e instanceof RegExp);
      expect(hasRegex).toBe(true);
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
        external: rollupPlugin.externals,
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
        external: rollupPlugin.externals,
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
        external: rollupPlugin.externals,
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
        external: rollupPlugin.externals,
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
        external: rollupPlugin.externals,
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
        external: rollupPlugin.externals,
      });

      const result = await bundle.generate({ format: "cjs", sourcemap: true });
      const [output] = result.output;

      expect(output.map).toBeDefined();
    });
  });
});
