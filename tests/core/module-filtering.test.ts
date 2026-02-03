/**
 * Tests for module filtering logic.
 * Verifies additionalModules, excludeModules, builtin skipping, and local import handling.
 */
import path from "node:path";

import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import { rollup } from "rollup";
import { describe, expect, it } from "vitest";

import rollupPlugin from "../../src/rollup";
import {
  combineFixtures,
  createCustomCjsFixture,
  createIoredisFixture,
  createPinoFixture,
} from "../helpers/fixtures";
import { useTempDir } from "../helpers/temp-dir";
import { createFixture } from "../utils";

describe("module filtering", () => {
  const temp = useTempDir();

  describe("default filtering", () => {
    it("does not wrap modules not in dd-trace hooks list", async () => {
      createFixture(temp.dir, {
        "index.js": `const foo = require('unknown-module'); module.exports = foo;`,
        "node_modules/unknown-module/package.json": JSON.stringify({
          name: "unknown-module",
          version: "1.0.0",
          main: "index.js",
        }),
        "node_modules/unknown-module/index.js": `module.exports = {};`,
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

      expect(output.code).not.toContain("dd-trace:bundler:load");
      expect(output.code).not.toContain("dc-polyfill");
    });

    it("wraps modules that are in dd-trace hooks list", async () => {
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
    });
  });

  describe("excludeModules option", () => {
    it("excludes modules in excludeModules option", async () => {
      createFixture(temp.dir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        ...createPinoFixture(),
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false, excludeModules: ["pino"] }),
          nodeResolve({ rootDir: temp.dir }),
          commonjs(),
        ],
      });

      const result = await bundle.generate({ format: "cjs" });
      const [output] = result.output;

      expect(output.code).not.toContain("dd-trace:bundler:load");
    });

    it("can exclude multiple modules", async () => {
      createFixture(temp.dir, {
        "index.js": `
          const pino = require('pino');
          const Redis = require('ioredis');
          module.exports = { pino, Redis };
        `,
        ...combineFixtures(createPinoFixture(), createIoredisFixture("5.3.0")),
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false, excludeModules: ["pino", "ioredis"] }),
          nodeResolve({ rootDir: temp.dir }),
          commonjs(),
        ],
      });

      const result = await bundle.generate({ format: "cjs" });
      const [output] = result.output;

      expect(output.code).not.toContain("dd-trace:bundler:load");
    });

    it("excludes only specified modules, keeps others", async () => {
      createFixture(temp.dir, {
        "index.js": `
          const pino = require('pino');
          const Redis = require('ioredis');
          module.exports = { pino, Redis };
        `,
        ...combineFixtures(createPinoFixture(), createIoredisFixture("5.3.0")),
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false, excludeModules: ["pino"] }),
          nodeResolve({ rootDir: temp.dir }),
          commonjs(),
        ],
        external: ["dc-polyfill"],
      });

      const result = await bundle.generate({ format: "cjs" });
      const [output] = result.output;

      // ioredis should still be instrumented
      expect(output.code).toContain("dd-trace:bundler:load");
      expect(output.code).toContain("ioredis");
    });
  });

  describe("additionalModules option", () => {
    it("includes modules in additionalModules option", async () => {
      createFixture(temp.dir, {
        "index.js": `const custom = require('custom-module'); module.exports = custom;`,
        ...createCustomCjsFixture(
          "custom-module",
          "1.0.0",
          `module.exports = {};`,
        ),
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false, additionalModules: ["custom-module"] }),
          nodeResolve({ rootDir: temp.dir }),
          commonjs(),
        ],
        external: ["dc-polyfill"],
      });

      const result = await bundle.generate({ format: "cjs" });
      const [output] = result.output;

      expect(output.code).toContain("dd-trace:bundler:load");
      expect(output.code).toContain("custom-module");
    });

    it("can add multiple additional modules", async () => {
      createFixture(temp.dir, {
        "index.js": `
          const custom1 = require('custom-one');
          const custom2 = require('custom-two');
          module.exports = { custom1, custom2 };
        `,
        ...combineFixtures(
          createCustomCjsFixture(
            "custom-one",
            "1.0.0",
            `module.exports = { name: 'one' };`,
          ),
          createCustomCjsFixture(
            "custom-two",
            "2.0.0",
            `module.exports = { name: 'two' };`,
          ),
        ),
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({
            debug: false,
            additionalModules: ["custom-one", "custom-two"],
          }),
          nodeResolve({ rootDir: temp.dir }),
          commonjs(),
        ],
        external: ["dc-polyfill"],
      });

      const result = await bundle.generate({ format: "cjs" });
      const [output] = result.output;

      const channelMatches = output.code.match(/dd-trace:bundler:load/g);
      expect(channelMatches?.length).toBeGreaterThanOrEqual(2);
    });

    it("works with scoped packages in additionalModules", async () => {
      createFixture(temp.dir, {
        "index.js": `const pkg = require('@myorg/my-pkg'); module.exports = pkg;`,
        "node_modules/@myorg/my-pkg/package.json": JSON.stringify({
          name: "@myorg/my-pkg",
          version: "1.0.0",
          main: "index.js",
        }),
        "node_modules/@myorg/my-pkg/index.js": `module.exports = {};`,
      }); // Keep scoped package fixture inline as it's a one-off

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false, additionalModules: ["@myorg/my-pkg"] }),
          nodeResolve({ rootDir: temp.dir }),
          commonjs(),
        ],
        external: ["dc-polyfill"],
      });

      const result = await bundle.generate({ format: "cjs" });
      const [output] = result.output;

      expect(output.code).toContain("dd-trace:bundler:load");
      expect(output.code).toContain("@myorg/my-pkg");
    });
  });

  describe("local imports", () => {
    it("does not wrap local imports", async () => {
      createFixture(temp.dir, {
        "index.js": `import { helper } from './utils.js'; export { helper };`,
        "utils.js": `export const helper = () => {};`,
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [rollupPlugin({ debug: false })],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      expect(output.code).not.toContain("dd-trace:bundler:load");
      expect(output.code).not.toContain("import-in-the-middle");
    });

    it("does not wrap relative imports from app code", async () => {
      createFixture(temp.dir, {
        "index.js": `
          import { a } from './lib/a.js';
          import { b } from '../shared/b.js';
          export { a, b };
        `,
        "lib/a.js": `export const a = 1;`,
        "../shared/b.js": `export const b = 2;`,
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [rollupPlugin({ debug: false })],
        onwarn() {
          // Suppress warnings about missing ../shared/b.js
        },
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      expect(output.code).not.toContain("dd-trace:bundler:load");
      expect(output.code).not.toContain("import-in-the-middle");
    });
  });

  describe("Node.js builtins", () => {
    it("skips Node.js builtin modules", async () => {
      createFixture(temp.dir, {
        "index.js": `
          import fs from 'node:fs';
          import path from 'node:path';
          import http from 'http';
          export { fs, path, http };
        `,
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [rollupPlugin({ debug: false })],
        external: ["node:fs", "node:path", "http"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      // Builtins should not be wrapped - they're handled at runtime by dd-trace
      expect(output.code).not.toContain("dd-trace:bundler:load");
      expect(output.code).not.toContain("import-in-the-middle");
    });

    it("skips builtins with node: prefix", async () => {
      createFixture(temp.dir, {
        "index.js": `
          import crypto from 'node:crypto';
          import stream from 'node:stream';
          export { crypto, stream };
        `,
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [rollupPlugin({ debug: false })],
        external: ["node:crypto", "node:stream"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      expect(output.code).not.toContain("dd-trace:bundler:load");
    });

    it("skips builtins without node: prefix", async () => {
      createFixture(temp.dir, {
        "index.js": `
          import fs from 'fs';
          import path from 'path';
          export { fs, path };
        `,
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [rollupPlugin({ debug: false })],
        external: ["fs", "path"],
      });

      const result = await bundle.generate({ format: "es" });
      const [output] = result.output;

      expect(output.code).not.toContain("dd-trace:bundler:load");
    });
  });
});
