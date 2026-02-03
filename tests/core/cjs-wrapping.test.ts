/**
 * Tests for CommonJS module wrapping functionality.
 * Verifies that CJS modules are wrapped with dc-polyfill channel for dd-trace instrumentation.
 */
import path from "node:path";

import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import { rollup } from "rollup";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import rollupPlugin from "../../src/rollup";
import { createFixture, createTempDir } from "../utils";

describe("CJS module wrapping", () => {
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

  describe("basic wrapping", () => {
    it("wraps CommonJS pino module with dc-polyfill channel", async () => {
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

      expect(output.code).toContain("dc-polyfill");
      expect(output.code).toContain("dd-trace:bundler:load");
      expect(output.code).toContain("pino");
      expect(output.code).toContain("8.0.0");
    });

    it("wraps CommonJS ioredis module", async () => {
      createFixture(tempDir, {
        "index.js": `const Redis = require('ioredis'); module.exports = Redis;`,
        "node_modules/ioredis/package.json": JSON.stringify({
          name: "ioredis",
          version: "5.3.0",
          main: "index.js",
        }),
        "node_modules/ioredis/index.js": `module.exports = function Redis() {};`,
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
      expect(output.code).toContain("ioredis");
      expect(output.code).toContain("5.3.0");
    });
  });

  describe("submodule imports", () => {
    it("includes package path for submodule imports", async () => {
      createFixture(tempDir, {
        "index.js": `const get = require('lodash/get'); module.exports = get;`,
        "node_modules/lodash/package.json": JSON.stringify({
          name: "lodash",
          version: "4.17.21",
        }),
        "node_modules/lodash/get.js": `module.exports = function get() {};`,
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

      expect(output.code).toContain("lodash/get");
      expect(output.code).toContain("4.17.21");
    });

    it("handles deep submodule paths", async () => {
      createFixture(tempDir, {
        "index.js": `const get = require('lodash/fp/get'); module.exports = get;`,
        "node_modules/lodash/package.json": JSON.stringify({
          name: "lodash",
          version: "4.17.21",
        }),
        "node_modules/lodash/fp/get.js": `module.exports = function get() {};`,
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

      expect(output.code).toContain("lodash/fp/get");
      expect(output.code).toContain("4.17.21");
    });
  });

  describe("scoped packages", () => {
    it("handles @scope/package correctly", async () => {
      // @aws-sdk/smithy-client is in dd-trace hooks list
      createFixture(tempDir, {
        "index.js": `const smithy = require('@aws-sdk/smithy-client'); module.exports = smithy;`,
        "node_modules/@aws-sdk/smithy-client/package.json": JSON.stringify({
          name: "@aws-sdk/smithy-client",
          version: "3.400.0",
          main: "index.js",
        }),
        "node_modules/@aws-sdk/smithy-client/index.js": `module.exports = { Client: function() {} };`,
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

      expect(output.code).toContain("@aws-sdk/smithy-client");
      expect(output.code).toContain("3.400.0");
    });

    it("handles scoped package with additionalModules", async () => {
      createFixture(tempDir, {
        "index.js": `const { GetObjectCommand } = require('@aws-sdk/client-s3'); module.exports = GetObjectCommand;`,
        "node_modules/@aws-sdk/client-s3/package.json": JSON.stringify({
          name: "@aws-sdk/client-s3",
          version: "3.500.0",
          main: "index.js",
        }),
        "node_modules/@aws-sdk/client-s3/index.js": `module.exports = { GetObjectCommand: function() {} };`,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({
            debug: false,
            additionalModules: ["@aws-sdk/client-s3"],
          }),
          nodeResolve({ rootDir: tempDir }),
          commonjs(),
        ],
        external: ["dc-polyfill"],
      });

      const result = await bundle.generate({ format: "cjs" });
      const [output] = result.output;

      expect(output.code).toContain("@aws-sdk/client-s3");
      expect(output.code).toContain("3.500.0");
      expect(output.code).toContain("dd-trace:bundler:load");
    });

    it("handles nested node_modules", async () => {
      createFixture(tempDir, {
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
        "node_modules/parent-pkg/node_modules/pino/package.json":
          JSON.stringify({
            name: "pino",
            version: "7.0.0",
            main: "index.js",
          }),
        "node_modules/parent-pkg/node_modules/pino/index.js": `module.exports = { log: function() {} };`,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "index.js"),
        plugins: [
          rollupPlugin({ debug: false, additionalModules: ["parent-pkg"] }),
          nodeResolve({ rootDir: tempDir }),
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

  describe("multiple modules", () => {
    it("wraps multiple instrumentable modules in same bundle", async () => {
      createFixture(tempDir, {
        "index.js": `
          const pino = require('pino');
          const Redis = require('ioredis');
          module.exports = { pino, Redis };
        `,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          main: "index.js",
        }),
        "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
        "node_modules/ioredis/package.json": JSON.stringify({
          name: "ioredis",
          version: "5.3.0",
          main: "index.js",
        }),
        "node_modules/ioredis/index.js": `module.exports = function Redis() {};`,
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

      expect(output.code).toContain("pino");
      expect(output.code).toContain("8.0.0");
      expect(output.code).toContain("ioredis");
      expect(output.code).toContain("5.3.0");

      const channelMatches = output.code.match(/dd-trace:bundler:load/g);
      expect(channelMatches?.length).toBeGreaterThanOrEqual(2);
    });
  });
});
