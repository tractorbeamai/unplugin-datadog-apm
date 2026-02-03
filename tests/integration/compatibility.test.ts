/**
 * Tests for compatibility with different environments and edge cases.
 * Includes package manager compatibility, version handling, module resolution edge cases,
 * and other environmental factors.
 */
import path from "node:path";

import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import { rollup } from "rollup";
import { describe, expect, it } from "vitest";

import rollupPlugin from "../../src/rollup";
import { createPinoFixture } from "../helpers/fixtures";
import { useTempDir } from "../helpers/temp-dir";
import { createFixture } from "../utils";

describe("compatibility", () => {
  const temp = useTempDir();

  describe("package manager structures", () => {
    describe("npm/yarn classic", () => {
      it("works with flat node_modules", async () => {
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

        expect(output.code).toContain("dd-trace:bundler:load");
        expect(output.code).toContain("package: 'pino'");
      });
    });

    describe("pnpm", () => {
      it("works with pnpm-style .pnpm directory structure", async () => {
        createFixture(temp.dir, {
          "index.js": `const pino = require('pino'); module.exports = pino;`,
          "node_modules/.pnpm/pino@8.0.0/node_modules/pino/package.json":
            JSON.stringify({
              name: "pino",
              version: "8.0.0",
              main: "index.js",
            }),
          "node_modules/.pnpm/pino@8.0.0/node_modules/pino/index.js": `module.exports = { log: function() {} };`,
          "node_modules/pino/package.json": JSON.stringify({
            name: "pino",
            version: "8.0.0",
            main: "index.js",
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

        expect(output.code).toContain("dd-trace:bundler:load");
        expect(output.code).toContain("package: 'pino'");
      });

      it("handles nested pnpm dependencies", async () => {
        createFixture(temp.dir, {
          "index.js": `const parent = require('parent-pkg'); module.exports = parent;`,
          "node_modules/parent-pkg/package.json": JSON.stringify({
            name: "parent-pkg",
            version: "1.0.0",
            main: "index.js",
          }),
          "node_modules/parent-pkg/index.js": `
            const pino = require('pino');
            module.exports = { pino };
          `,
          "node_modules/pino/package.json": JSON.stringify({
            name: "pino",
            version: "8.0.0",
            main: "index.js",
          }),
          "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
        });

        const bundle = await rollup({
          input: path.join(temp.dir, "index.js"),
          plugins: [
            rollupPlugin({ debug: false, additionalModules: ["parent-pkg"] }),
            nodeResolve({ rootDir: temp.dir }),
            commonjs(),
          ],
          external: ["dc-polyfill"],
        });

        const result = await bundle.generate({ format: "cjs" });
        const [output] = result.output;

        expect(output.code).toContain("dd-trace:bundler:load");
        expect(output.code).toContain("pino");
      });
    });

    describe("monorepo workspaces", () => {
      it("handles workspace package references", async () => {
        createFixture(temp.dir, {
          "packages/app/index.js": `
            const shared = require('@myorg/shared');
            const pino = require('pino');
            module.exports = { shared, pino };
          `,
          "packages/app/package.json": JSON.stringify({
            name: "@myorg/app",
            version: "1.0.0",
          }),
          "node_modules/@myorg/shared/package.json": JSON.stringify({
            name: "@myorg/shared",
            version: "1.0.0",
            main: "index.js",
          }),
          "node_modules/@myorg/shared/index.js": `module.exports = { util: 'shared' };`,
          "node_modules/pino/package.json": JSON.stringify({
            name: "pino",
            version: "8.0.0",
            main: "index.js",
          }),
          "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
        });

        const bundle = await rollup({
          input: path.join(temp.dir, "packages/app/index.js"),
          plugins: [
            rollupPlugin({ debug: false }),
            nodeResolve({ rootDir: temp.dir }),
            commonjs(),
          ],
          external: ["dc-polyfill"],
        });

        const result = await bundle.generate({ format: "cjs" });
        const [output] = result.output;

        expect(output.code).toContain("dd-trace:bundler:load");
        expect(output.code).toContain("package: 'pino'");
      });
    });

    describe("hoisting edge cases", () => {
      it("handles deeply nested node_modules (no hoisting)", async () => {
        createFixture(temp.dir, {
          "index.js": `const parent = require('parent'); module.exports = parent;`,
          "node_modules/parent/package.json": JSON.stringify({
            name: "parent",
            version: "1.0.0",
            main: "index.js",
          }),
          "node_modules/parent/index.js": `
            const child = require('child');
            module.exports = { child };
          `,
          "node_modules/parent/node_modules/child/package.json": JSON.stringify(
            {
              name: "child",
              version: "2.0.0",
              main: "index.js",
            },
          ),
          "node_modules/parent/node_modules/child/index.js": `module.exports = { name: 'child' };`,
        });

        const bundle = await rollup({
          input: path.join(temp.dir, "index.js"),
          plugins: [
            rollupPlugin({
              debug: false,
              additionalModules: ["parent", "child"],
            }),
            nodeResolve({ rootDir: temp.dir }),
            commonjs(),
          ],
          external: ["dc-polyfill"],
        });

        const result = await bundle.generate({ format: "cjs" });
        const [output] = result.output;

        expect(output.code).toContain("dd-trace:bundler:load");
      });
    });
  });

  describe("version handling", () => {
    it("handles numeric version in package.json", async () => {
      createFixture(temp.dir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: 8, // Numeric version - invalid but might exist
          main: "index.js",
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

      expect(output.code).toContain("dd-trace:bundler:load");
      expect(output.code).toMatch(/version:\s*['"]?8['"]?/);
    });

    it("handles pre-release version strings", async () => {
      createFixture(temp.dir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0-beta.1+build.123",
          main: "index.js",
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

      expect(output.code).toContain("8.0.0-beta.1+build.123");
    });
  });

  describe("module resolution edge cases", () => {
    it("handles package with only exports field (no main)", async () => {
      createFixture(temp.dir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          exports: {
            ".": "./lib/pino.js",
          },
        }),
        "node_modules/pino/lib/pino.js": `module.exports = { log: function() {} };`,
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: temp.dir, exportConditions: ["node"] }),
          commonjs(),
        ],
        external: ["dc-polyfill"],
      });

      const result = await bundle.generate({ format: "cjs" });
      const [output] = result.output;

      expect(output.code).toContain("dd-trace:bundler:load");
      expect(output.code).toMatch(/path:\s*['"]pino/);
    });

    it("handles conditional exports", async () => {
      createFixture(temp.dir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          exports: {
            ".": {
              require: "./cjs/index.js",
              import: "./esm/index.js",
            },
          },
        }),
        "node_modules/pino/cjs/index.js": `module.exports = { log: function() {} };`,
        "node_modules/pino/esm/index.js": `export const log = () => {};`,
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({
            rootDir: temp.dir,
            exportConditions: ["node", "require"],
          }),
          commonjs(),
        ],
        external: ["dc-polyfill"],
      });

      const result = await bundle.generate({ format: "cjs" });
      const [output] = result.output;

      expect(output.code).toContain("dd-trace:bundler:load");
    });

    it("handles very deep submodule paths", async () => {
      createFixture(temp.dir, {
        "index.js": `const util = require('lodash/fp/collection/map'); module.exports = util;`,
        "node_modules/lodash/package.json": JSON.stringify({
          name: "lodash",
          version: "4.17.21",
        }),
        "node_modules/lodash/fp/collection/map.js": `module.exports = function map() {};`,
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

      expect(output.code).toContain("dd-trace:bundler:load");
      expect(output.code).toContain("lodash/fp/collection/map");
    });
  });

  describe("CJS edge cases", () => {
    it("handles module that reassigns module.exports multiple times", async () => {
      createFixture(temp.dir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          main: "index.js",
        }),
        "node_modules/pino/index.js": `
          module.exports = { initial: true };
          module.exports = { final: true };
          module.exports.added = 'later';
        `,
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

      expect(output.code).toContain("dd-trace:bundler:load");
      expect(output.code).toContain("final");
    });

    it("handles module using exports shorthand", async () => {
      createFixture(temp.dir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          main: "index.js",
        }),
        "node_modules/pino/index.js": `
          exports.log = function() {};
          exports.warn = function() {};
        `,
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

      expect(output.code).toContain("dd-trace:bundler:load");
    });

    it("handles TypeScript-style export assignment pattern", async () => {
      createFixture(temp.dir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          main: "index.js",
        }),
        "node_modules/pino/index.js": `
          function pino() { return {}; }
          pino.default = pino;
          module.exports = pino;
        `,
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

      expect(output.code).toContain("dd-trace:bundler:load");
    });
  });

  describe("multiple entry points", () => {
    it("handles multiple entry points sharing same module", async () => {
      createFixture(temp.dir, {
        "entry1.js": `const pino = require('pino'); module.exports = { entry: 1, pino };`,
        "entry2.js": `const pino = require('pino'); module.exports = { entry: 2, pino };`,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          main: "index.js",
        }),
        "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
      });

      const bundle = await rollup({
        input: [
          path.join(temp.dir, "entry1.js"),
          path.join(temp.dir, "entry2.js"),
        ],
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: temp.dir }),
          commonjs(),
        ],
        external: ["dc-polyfill"],
      });

      const result = await bundle.generate({ format: "cjs" });

      expect(result.output.length).toBeGreaterThanOrEqual(2);
    });
  });
});
