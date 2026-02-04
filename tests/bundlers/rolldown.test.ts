/**
 * Tests for rolldown integration.
 * Rolldown is a Rollup-compatible bundler written in Rust.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { rolldown } from "rolldown";
import { describe, expect, it } from "vitest";

import rolldownPlugin from "../../src/rolldown";
import {
  expectIitmProxyInjected,
  expectInstrumented,
  expectNotInstrumented,
} from "../helpers/assertions";
import {
  createCustomCjsFixture,
  createPinoFixture,
  createUndiciFixture,
} from "../helpers/fixtures";
import { useTempDir } from "../helpers/temp-dir";
import { createFixture } from "../utils";

describe("unplugin-datadog-apm (rolldown)", () => {
  const temp = useTempDir();

  describe("CJS builds", () => {
    it("wraps CJS modules for instrumentation", async () => {
      createFixture(temp.dir, {
        "index.js": `import pino from 'pino'; export default pino;`,
        ...createPinoFixture(),
      });

      const bundle = await rolldown({
        input: path.join(temp.dir, "index.js"),
        plugins: [rolldownPlugin()],
        external: ["dc-polyfill"],
        resolve: {
          modules: [path.join(temp.dir, "node_modules")],
        },
      });

      await bundle.write({
        dir: path.join(temp.dir, "dist"),
        format: "cjs",
      });

      const output = readFileSync(path.join(temp.dir, "dist/index.js"), "utf8");

      // Should wrap CJS module with dd-trace channel
      expectInstrumented(output);
      expect(output).toContain("dc-polyfill");
    });

    it("respects excludeModules option", async () => {
      createFixture(temp.dir, {
        "index.js": `import pino from 'pino'; export default pino;`,
        ...createPinoFixture(),
      });

      const bundle = await rolldown({
        input: path.join(temp.dir, "index.js"),
        plugins: [rolldownPlugin({ excludeModules: ["pino"] })],
        resolve: {
          modules: [path.join(temp.dir, "node_modules")],
        },
      });

      await bundle.write({
        dir: path.join(temp.dir, "dist"),
        format: "cjs",
      });

      const output = readFileSync(path.join(temp.dir, "dist/index.js"), "utf8");

      // Should NOT wrap excluded module
      expectNotInstrumented(output);
    });

    it("respects additionalModules option", async () => {
      createFixture(temp.dir, {
        "index.js": `import custom from 'custom-pkg'; export default custom;`,
        ...createCustomCjsFixture("custom-pkg"),
      });

      const bundle = await rolldown({
        input: path.join(temp.dir, "index.js"),
        plugins: [
          rolldownPlugin({
            additionalModules: ["custom-pkg"],
          }),
        ],
        external: ["dc-polyfill"],
        resolve: {
          modules: [path.join(temp.dir, "node_modules")],
        },
      });

      await bundle.write({
        dir: path.join(temp.dir, "dist"),
        format: "cjs",
      });

      const output = readFileSync(path.join(temp.dir, "dist/index.js"), "utf8");

      // Should wrap additional module
      expectInstrumented(output);
      expect(output).toContain("custom-pkg");
    });
  });

  describe("ESM builds", () => {
    it("creates ESM proxy for ESM modules", async () => {
      createFixture(temp.dir, {
        "index.js": `import { something } from 'undici'; export { something };`,
        ...createUndiciFixture(),
      });

      const bundle = await rolldown({
        input: path.join(temp.dir, "index.js"),
        plugins: [rolldownPlugin()],
        external: ["import-in-the-middle/lib/register.js"],
        resolve: {
          modules: [path.join(temp.dir, "node_modules")],
        },
      });

      await bundle.write({
        dir: path.join(temp.dir, "dist"),
        format: "esm",
      });

      const output = readFileSync(path.join(temp.dir, "dist/index.js"), "utf8");

      // Should create ESM proxy with import-in-the-middle
      expectIitmProxyInjected(output);
    });
  });

  describe("output formats", () => {
    it("works with ESM format", async () => {
      createFixture(temp.dir, {
        "index.js": `import { something } from 'undici'; export { something };`,
        ...createUndiciFixture(),
      });

      const bundle = await rolldown({
        input: path.join(temp.dir, "index.js"),
        plugins: [rolldownPlugin()],
        external: ["import-in-the-middle/lib/register.js"],
        resolve: {
          modules: [path.join(temp.dir, "node_modules")],
        },
      });

      await bundle.write({
        dir: path.join(temp.dir, "dist"),
        format: "esm",
      });

      const output = readFileSync(path.join(temp.dir, "dist/index.js"), "utf8");
      expect(output).toContain("register");
    });

    it("works with CJS format", async () => {
      createFixture(temp.dir, {
        "index.js": `import pino from 'pino'; export default pino;`,
        ...createPinoFixture(),
      });

      const bundle = await rolldown({
        input: path.join(temp.dir, "index.js"),
        plugins: [rolldownPlugin()],
        external: ["dc-polyfill"],
        resolve: {
          modules: [path.join(temp.dir, "node_modules")],
        },
      });

      await bundle.write({
        dir: path.join(temp.dir, "dist"),
        format: "cjs",
      });

      const output = readFileSync(path.join(temp.dir, "dist/index.js"), "utf8");
      expectInstrumented(output);
    });
  });
});
