import path from "node:path";

import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import { rollup } from "rollup";
import { describe, expect, it } from "vitest";

import rollupPlugin from "../../src/rollup";
import { useTempDir } from "../helpers/temp-dir";
import { createFixture } from "../utils";

describe("error handling", () => {
  const temp = useTempDir();

  describe("unresolvable modules", () => {
    it("continues gracefully when instrumentable module cannot be resolved", async () => {
      // Entry imports pino but pino doesn't exist in node_modules
      createFixture(temp.dir, {
        "index.js": `
          // This import will fail to resolve but the plugin should handle it gracefully
          let pino;
          try {
            pino = require('pino');
          } catch (e) {
            pino = { log: () => {} };
          }
          module.exports = pino;
        `,
      });

      // Build should complete without throwing
      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: temp.dir }),
          commonjs(),
        ],
        onwarn() {
          // Suppress warnings
        },
      });

      const result = await bundle.generate({ format: "cjs" });
      const [output] = result.output;

      // Output should exist but not have instrumentation (module wasn't found)
      expect(output.code).toBeDefined();
    });
  });

  describe("missing package.json", () => {
    it("continues gracefully when package.json is missing", async () => {
      // Create module directory without package.json
      createFixture(temp.dir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
        // Note: no package.json for pino
      });

      // Build should complete without throwing
      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: temp.dir }),
          commonjs(),
        ],
        onwarn() {
          // Suppress warnings
        },
      });

      const result = await bundle.generate({ format: "cjs" });
      const [output] = result.output;

      // Build completes, version will be "unknown"
      expect(output.code).toBeDefined();
    });
  });

  describe("malformed package.json", () => {
    it("continues gracefully when package.json is invalid JSON", async () => {
      createFixture(temp.dir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        "node_modules/pino/package.json": `{ invalid json syntax`,
        "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
      });

      // Build should complete without throwing
      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: temp.dir }),
          commonjs(),
        ],
        onwarn() {
          // Suppress warnings
        },
      });

      const result = await bundle.generate({ format: "cjs" });
      const [output] = result.output;

      // Build completes despite malformed package.json
      expect(output.code).toBeDefined();
    });

    it('uses "unknown" version when package.json has no version field', async () => {
      createFixture(temp.dir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          main: "index.js",
          // Note: no version field
        }),
        "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
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

      // Should still wrap the module with "unknown" version
      expect(output.code).toContain("dd-trace:bundler:load");
      expect(output.code).toContain("unknown");
    });
  });

  describe("malformed ESM code", () => {
    it("falls back to default export when exports cannot be parsed", async () => {
      // Create ESM module with syntax that might confuse simple regex parsing
      createFixture(temp.dir, {
        "index.js": `import { something } from 'complex-esm'; export { something };`,
        "node_modules/complex-esm/package.json": JSON.stringify({
          name: "complex-esm",
          version: "1.0.0",
          type: "module",
          main: "index.js",
        }),
        // Module with complex/unusual export syntax
        "node_modules/complex-esm/index.js": `
          // Comments with export keyword in them
          /* export const fake = true; */
          const _internal = 'value';
          // String containing export
          const str = "export default something";
          export const something = { value: _internal };
        `,
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false, additionalModules: ["complex-esm"] }),
          nodeResolve({ rootDir: temp.dir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      // Should still create a proxy, even if export parsing is imperfect
      expect(output.code).toContain("import-in-the-middle/lib/register.js");
      expect(output.code).toContain("register");
    });

    it("handles modules with no detectable exports", async () => {
      createFixture(temp.dir, {
        "index.js": `import mod from 'minimal-esm'; export default mod;`,
        "node_modules/minimal-esm/package.json": JSON.stringify({
          name: "minimal-esm",
          version: "1.0.0",
          type: "module",
          main: "index.js",
        }),
        // Module that only has side effects, no exports
        "node_modules/minimal-esm/index.js": `
          // Side-effect only module
          console.log('loaded');
        `,
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false, additionalModules: ["minimal-esm"] }),
          nodeResolve({ rootDir: temp.dir }),
        ],
        external: ["import-in-the-middle/lib/register.js"],
        onwarn() {
          // Suppress warnings
        },
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      // Should fall back to default export
      expect(output.code).toContain("register");
    });
  });

  describe("non-instrumentable scenarios", () => {
    it("skips modules that are not in hooks list and not in additionalModules", async () => {
      createFixture(temp.dir, {
        "index.js": `const foo = require('not-instrumentable'); module.exports = foo;`,
        "node_modules/not-instrumentable/package.json": JSON.stringify({
          name: "not-instrumentable",
          version: "1.0.0",
          main: "index.js",
        }),
        "node_modules/not-instrumentable/index.js": `module.exports = {};`,
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: temp.dir }),
          commonjs(),
        ],
      });

      const result = await bundle.generate({ format: "cjs" });
      const [output] = result.output;

      // Should not wrap non-instrumentable modules
      expect(output.code).not.toContain("dd-trace:bundler:load");
      expect(output.code).not.toContain("dc-polyfill");
    });
  });
});
