/**
 * Tests for CommonJS module wrapping functionality.
 * Verifies that CJS modules are wrapped with dc-polyfill channel for dd-trace instrumentation.
 */
import path from "node:path";

import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import { rollup } from "rollup";
import { describe, expect, it } from "vitest";

import rollupPlugin from "../../src/rollup";
import {
  combineFixtures,
  createAwsSdkS3Fixture,
  createAwsSdkSmithyClientFixture,
  createIoredisFixture,
  createLodashFixture,
  createPinoFixture,
} from "../helpers/fixtures";
import { useTempDir } from "../helpers/temp-dir";
import { createFixture } from "../utils";

describe("CJS module wrapping", () => {
  const temp = useTempDir();

  describe("basic wrapping", () => {
    it("wraps CommonJS pino module with dc-polyfill channel", async () => {
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

      expect(output.code).toContain("dc-polyfill");
      expect(output.code).toContain("dd-trace:bundler:load");
      expect(output.code).toContain("pino");
      expect(output.code).toContain("8.0.0");
    });

    it("wraps CommonJS ioredis module", async () => {
      createFixture(temp.dir, {
        "index.js": `const Redis = require('ioredis'); module.exports = Redis;`,
        ...createIoredisFixture("5.3.0"),
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
      expect(output.code).toContain("ioredis");
      expect(output.code).toContain("5.3.0");
    });
  });

  describe("submodule imports", () => {
    it("includes package path for submodule imports", async () => {
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

      expect(output.code).toContain("lodash/get");
      expect(output.code).toContain("4.17.21");
    });

    it("handles deep submodule paths", async () => {
      createFixture(temp.dir, {
        "index.js": `const get = require('lodash/fp/get'); module.exports = get;`,
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

      expect(output.code).toContain("lodash/fp/get");
      expect(output.code).toContain("4.17.21");
    });
  });

  describe("scoped packages", () => {
    it("handles @scope/package correctly", async () => {
      // @aws-sdk/smithy-client is in dd-trace hooks list
      createFixture(temp.dir, {
        "index.js": `const smithy = require('@aws-sdk/smithy-client'); module.exports = smithy;`,
        ...createAwsSdkSmithyClientFixture(),
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

      expect(output.code).toContain("@aws-sdk/smithy-client");
      expect(output.code).toContain("3.400.0");
    });

    it("handles scoped package with additionalModules", async () => {
      createFixture(temp.dir, {
        "index.js": `const { GetObjectCommand } = require('@aws-sdk/client-s3'); module.exports = GetObjectCommand;`,
        ...createAwsSdkS3Fixture(),
      });

      const bundle = await rollup({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rollupPlugin({
            debug: false,
            additionalModules: ["@aws-sdk/client-s3"],
          }),
          nodeResolve({ rootDir: temp.dir }),
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
        "node_modules/parent-pkg/node_modules/pino/package.json":
          JSON.stringify({
            name: "pino",
            version: "7.0.0",
            main: "index.js",
          }),
        "node_modules/parent-pkg/node_modules/pino/index.js": `module.exports = { log: function() {} };`,
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

  describe("multiple modules", () => {
    it("wraps multiple instrumentable modules in same bundle", async () => {
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
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: temp.dir }),
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
