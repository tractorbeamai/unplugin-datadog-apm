/**
 * Tests for esbuild integration.
 * Verifies ESM and CJS builds, auto-externalization, banner injection, and module wrapping.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import * as esbuild from "esbuild";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import esbuildPlugin from "../../src/esbuild";
import {
  expectInstrumented,
  expectNotInstrumented,
} from "../helpers/assertions";
import { createFixture, createTempDir } from "../utils";

describe("unplugin-datadog-apm (esbuild)", () => {
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

  describe("ESM builds", () => {
    it("injects init banner with createRequire", async () => {
      createFixture(tempDir, {
        "index.ts": `console.log("hello");`,
      });

      await esbuild.build({
        entryPoints: [path.join(tempDir, "index.ts")],
        bundle: true,
        platform: "node",
        format: "esm",
        outfile: path.join(tempDir, "dist/bundle.mjs"),
        plugins: [esbuildPlugin()],
      });

      const output = readFileSync(
        path.join(tempDir, "dist/bundle.mjs"),
        "utf8",
      );

      // Should have createRequire for ESM compatibility
      expect(output).toContain("createRequire");
      expect(output).toContain("import.meta.url");

      // Should have init code
      expect(output).toContain("dd-trace");
      expect(output).toContain("isMainThread");
      expect(output).toContain("TracerProvider");
    });

    it("injects ESM loader hook registration", async () => {
      createFixture(tempDir, {
        "index.ts": `console.log("hello");`,
      });

      await esbuild.build({
        entryPoints: [path.join(tempDir, "index.ts")],
        bundle: true,
        platform: "node",
        format: "esm",
        outfile: path.join(tempDir, "dist/bundle.mjs"),
        plugins: [esbuildPlugin()],
      });

      const output = readFileSync(
        path.join(tempDir, "dist/bundle.mjs"),
        "utf8",
      );

      // Should register ESM loader hook
      expect(output).toContain("Module.register");
      expect(output).toContain("loader-hook.mjs");
    });

    it("wraps CJS modules for instrumentation", async () => {
      createFixture(tempDir, {
        "index.ts": `import pino from 'pino'; console.log(pino);`,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          main: "index.js",
        }),
        "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
      });

      await esbuild.build({
        entryPoints: [path.join(tempDir, "index.ts")],
        bundle: true,
        platform: "node",
        format: "esm",
        outfile: path.join(tempDir, "dist/bundle.mjs"),
        plugins: [esbuildPlugin()],
        // dc-polyfill is external since it's not in the test fixture
        external: ["dc-polyfill"],
      });

      const output = readFileSync(
        path.join(tempDir, "dist/bundle.mjs"),
        "utf8",
      );

      // Should wrap CJS module with dd-trace channel
      expectInstrumented(output);
      expect(output).toContain("dc-polyfill");
    });

    it("skips init banner when autoInit is false", async () => {
      createFixture(tempDir, {
        "index.ts": `console.log("hello");`,
      });

      await esbuild.build({
        entryPoints: [path.join(tempDir, "index.ts")],
        bundle: true,
        platform: "node",
        format: "esm",
        outfile: path.join(tempDir, "dist/bundle.mjs"),
        plugins: [esbuildPlugin({ autoInit: false })],
      });

      const output = readFileSync(
        path.join(tempDir, "dist/bundle.mjs"),
        "utf8",
      );

      // Should still have createRequire for CJS wrapper compatibility
      expect(output).toContain("createRequire");

      // Should NOT have init code
      expect(output).not.toContain("TracerProvider");
      expect(output).not.toContain("loader-hook.mjs");
    });
  });

  describe("CJS builds", () => {
    it("injects init banner", async () => {
      createFixture(tempDir, {
        "index.ts": `console.log("hello");`,
      });

      await esbuild.build({
        entryPoints: [path.join(tempDir, "index.ts")],
        bundle: true,
        platform: "node",
        format: "cjs",
        outfile: path.join(tempDir, "dist/bundle.cjs"),
        plugins: [esbuildPlugin()],
      });

      const output = readFileSync(
        path.join(tempDir, "dist/bundle.cjs"),
        "utf8",
      );

      // Should have init code
      expect(output).toContain("dd-trace");
      expect(output).toContain("isMainThread");
      expect(output).toContain("TracerProvider");
    });

    it("injects ESM loader hook registration for CJS", async () => {
      createFixture(tempDir, {
        "index.ts": `console.log("hello");`,
      });

      await esbuild.build({
        entryPoints: [path.join(tempDir, "index.ts")],
        bundle: true,
        platform: "node",
        format: "cjs",
        outfile: path.join(tempDir, "dist/bundle.cjs"),
        plugins: [esbuildPlugin()],
      });

      const output = readFileSync(
        path.join(tempDir, "dist/bundle.cjs"),
        "utf8",
      );

      // Should register ESM loader hook (for external ESM modules)
      expect(output).toContain("Module.register");
      expect(output).toContain("loader-hook.mjs");
      expect(output).toContain("pathToFileURL");
    });

    it("wraps CJS modules for instrumentation", async () => {
      createFixture(tempDir, {
        "index.ts": `const pino = require('pino'); console.log(pino);`,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          main: "index.js",
        }),
        "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
      });

      await esbuild.build({
        entryPoints: [path.join(tempDir, "index.ts")],
        bundle: true,
        platform: "node",
        format: "cjs",
        outfile: path.join(tempDir, "dist/bundle.cjs"),
        plugins: [esbuildPlugin()],
        // dc-polyfill is external since it's not in the test fixture
        external: ["dc-polyfill"],
      });

      const output = readFileSync(
        path.join(tempDir, "dist/bundle.cjs"),
        "utf8",
      );

      // Should wrap CJS module with dd-trace channel
      expectInstrumented(output);
    });

    it("skips init banner when autoInit is false", async () => {
      createFixture(tempDir, {
        "index.ts": `console.log("hello");`,
      });

      await esbuild.build({
        entryPoints: [path.join(tempDir, "index.ts")],
        bundle: true,
        platform: "node",
        format: "cjs",
        outfile: path.join(tempDir, "dist/bundle.cjs"),
        plugins: [esbuildPlugin({ autoInit: false })],
      });

      const output = readFileSync(
        path.join(tempDir, "dist/bundle.cjs"),
        "utf8",
      );

      // Should NOT have init code
      expect(output).not.toContain("TracerProvider");
      expect(output).not.toContain("loader-hook.mjs");
    });
  });

  describe("auto-externalization", () => {
    it("auto-externalizes dd-trace", async () => {
      createFixture(tempDir, {
        "index.ts": `import tracer from 'dd-trace'; console.log(tracer);`,
      });

      await esbuild.build({
        entryPoints: [path.join(tempDir, "index.ts")],
        bundle: true,
        platform: "node",
        format: "esm",
        outfile: path.join(tempDir, "dist/bundle.mjs"),
        plugins: [esbuildPlugin()],
      });

      const output = readFileSync(
        path.join(tempDir, "dist/bundle.mjs"),
        "utf8",
      );

      // dd-trace should be external (imported, not bundled)
      expect(output).toMatch(/import\s+(?:\S.*)?from\s+["']dd-trace["']/);
    });

    it("auto-externalizes @opentelemetry/api", async () => {
      createFixture(tempDir, {
        "index.ts": `import { trace } from '@opentelemetry/api'; console.log(trace);`,
      });

      await esbuild.build({
        entryPoints: [path.join(tempDir, "index.ts")],
        bundle: true,
        platform: "node",
        format: "esm",
        outfile: path.join(tempDir, "dist/bundle.mjs"),
        plugins: [esbuildPlugin()],
      });

      const output = readFileSync(
        path.join(tempDir, "dist/bundle.mjs"),
        "utf8",
      );

      // @opentelemetry/api should be external
      expect(output).toMatch(
        /import\s+(?:\S.*)?from\s+["']@opentelemetry\/api["']/,
      );
    });

    it("preserves user-specified externals", async () => {
      createFixture(tempDir, {
        "index.ts": `import express from 'express'; console.log(express);`,
      });

      await esbuild.build({
        entryPoints: [path.join(tempDir, "index.ts")],
        bundle: true,
        platform: "node",
        format: "esm",
        outfile: path.join(tempDir, "dist/bundle.mjs"),
        plugins: [esbuildPlugin()],
        external: ["express"],
      });

      const output = readFileSync(
        path.join(tempDir, "dist/bundle.mjs"),
        "utf8",
      );

      // User-specified external should be preserved
      expect(output).toMatch(/import\s+(?:\S.*)?from\s+["']express["']/);
    });
  });

  describe("module filtering", () => {
    it("respects excludeModules option", async () => {
      createFixture(tempDir, {
        "index.ts": `const pino = require('pino'); console.log(pino);`,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          main: "index.js",
        }),
        "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
      });

      await esbuild.build({
        entryPoints: [path.join(tempDir, "index.ts")],
        bundle: true,
        platform: "node",
        format: "cjs",
        outfile: path.join(tempDir, "dist/bundle.cjs"),
        plugins: [esbuildPlugin({ excludeModules: ["pino"] })],
      });

      const output = readFileSync(
        path.join(tempDir, "dist/bundle.cjs"),
        "utf8",
      );

      // Should NOT wrap excluded module
      expectNotInstrumented(output);
    });

    it("respects additionalModules option", async () => {
      createFixture(tempDir, {
        "index.ts": `const custom = require('custom-pkg'); console.log(custom);`,
        "node_modules/custom-pkg/package.json": JSON.stringify({
          name: "custom-pkg",
          version: "1.0.0",
          main: "index.js",
        }),
        "node_modules/custom-pkg/index.js": `module.exports = { hello: "world" };`,
      });

      await esbuild.build({
        entryPoints: [path.join(tempDir, "index.ts")],
        bundle: true,
        platform: "node",
        format: "cjs",
        outfile: path.join(tempDir, "dist/bundle.cjs"),
        plugins: [esbuildPlugin({ additionalModules: ["custom-pkg"] })],
        // dc-polyfill is external since it's not in the test fixture
        external: ["dc-polyfill"],
      });

      const output = readFileSync(
        path.join(tempDir, "dist/bundle.cjs"),
        "utf8",
      );

      // Should wrap additional module
      expectInstrumented(output);
      expect(output).toContain("custom-pkg");
    });
  });

  describe("IITM exclusions", () => {
    it("includes IITM exclusions in init banner", async () => {
      createFixture(tempDir, {
        "index.ts": `console.log("hello");`,
      });

      await esbuild.build({
        entryPoints: [path.join(tempDir, "index.ts")],
        bundle: true,
        platform: "node",
        format: "esm",
        outfile: path.join(tempDir, "dist/bundle.mjs"),
        plugins: [esbuildPlugin()],
      });

      const output = readFileSync(
        path.join(tempDir, "dist/bundle.mjs"),
        "utf8",
      );

      // Should include IITM exclusions for problematic packages
      expect(output).toContain("langsmith");
      expect(output).toContain("openai");
      expect(output).toContain("anthropic");
    });
  });

  describe("multiple entry points", () => {
    it("adds banner to all entry points", async () => {
      createFixture(tempDir, {
        "entry1.ts": `console.log("entry1");`,
        "entry2.ts": `console.log("entry2");`,
      });

      await esbuild.build({
        entryPoints: [
          path.join(tempDir, "entry1.ts"),
          path.join(tempDir, "entry2.ts"),
        ],
        bundle: true,
        platform: "node",
        format: "esm",
        outdir: path.join(tempDir, "dist"),
        plugins: [esbuildPlugin()],
      });

      const output1 = readFileSync(
        path.join(tempDir, "dist/entry1.js"),
        "utf8",
      );
      const output2 = readFileSync(
        path.join(tempDir, "dist/entry2.js"),
        "utf8",
      );

      // Both outputs should have init code
      expect(output1).toContain("dd-trace");
      expect(output2).toContain("dd-trace");
    });
  });
});
