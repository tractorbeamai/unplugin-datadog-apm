/**
 * Tests for esbuild integration.
 * Verifies ESM and CJS builds, auto-externalization, git metadata injection, and module wrapping.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import * as esbuild from "esbuild";
import { describe, expect, it } from "vitest";

import { getGitMetadata } from "../../src/core/git";
import esbuildPlugin from "../../src/esbuild";
import {
  expectInstrumented,
  expectNotInstrumented,
} from "../helpers/assertions";
import { createCustomCjsFixture, createPinoFixture } from "../helpers/fixtures";
import { useTempDir } from "../helpers/temp-dir";
import { createFixture } from "../utils";

describe("unplugin-datadog-apm (esbuild)", () => {
  const temp = useTempDir();

  describe("ESM builds", () => {
    it("wraps CJS modules for instrumentation", async () => {
      createFixture(temp.dir, {
        "index.ts": `import pino from 'pino'; console.log(pino);`,
        ...createPinoFixture(),
      });

      await esbuild.build({
        entryPoints: [path.join(temp.dir, "index.ts")],
        bundle: true,
        platform: "node",
        format: "esm",
        outfile: path.join(temp.dir, "dist/bundle.mjs"),
        plugins: [esbuildPlugin()],
        // dc-polyfill is external since it's not in the test fixture
        external: ["dc-polyfill"],
      });

      const output = readFileSync(
        path.join(temp.dir, "dist/bundle.mjs"),
        "utf8",
      );

      // Should wrap CJS module with dd-trace channel
      expectInstrumented(output);
      expect(output).toContain("dc-polyfill");
    });

    it("injects git metadata when available", async () => {
      createFixture(temp.dir, {
        "index.ts": `console.log("hello");`,
      });

      await esbuild.build({
        entryPoints: [path.join(temp.dir, "index.ts")],
        bundle: true,
        platform: "node",
        format: "esm",
        outfile: path.join(temp.dir, "dist/bundle.mjs"),
        plugins: [esbuildPlugin()],
      });

      const output = readFileSync(
        path.join(temp.dir, "dist/bundle.mjs"),
        "utf8",
      );

      const gitMetadata = getGitMetadata();
      if (gitMetadata.repositoryURL) {
        expect(output).toContain("DD_GIT_REPOSITORY_URL");
      }
      if (gitMetadata.commitSHA) {
        expect(output).toContain("DD_GIT_COMMIT_SHA");
      }
    });
  });

  describe("CJS builds", () => {
    it("requires keepNames when minifying", async () => {
      createFixture(temp.dir, {
        "index.ts": `console.log("hello");`,
      });

      await expect(
        esbuild.build({
          entryPoints: [path.join(temp.dir, "index.ts")],
          bundle: true,
          platform: "node",
          format: "cjs",
          outfile: path.join(temp.dir, "dist/bundle.cjs"),
          plugins: [esbuildPlugin()],
          minify: true,
        }),
      ).rejects.toThrow(/keep-names/);
    });

    it("wraps CJS modules for instrumentation", async () => {
      createFixture(temp.dir, {
        "index.ts": `const pino = require('pino'); console.log(pino);`,
        ...createPinoFixture(),
      });

      await esbuild.build({
        entryPoints: [path.join(temp.dir, "index.ts")],
        bundle: true,
        platform: "node",
        format: "cjs",
        outfile: path.join(temp.dir, "dist/bundle.cjs"),
        plugins: [esbuildPlugin()],
        // dc-polyfill is external since it's not in the test fixture
        external: ["dc-polyfill"],
      });

      const output = readFileSync(
        path.join(temp.dir, "dist/bundle.cjs"),
        "utf8",
      );

      // Should wrap CJS module with dd-trace channel
      expectInstrumented(output);
    });
  });

  describe("auto-externalization", () => {
    it("auto-externalizes dd-trace", async () => {
      createFixture(temp.dir, {
        "index.ts": `import tracer from 'dd-trace'; console.log(tracer);`,
      });

      await esbuild.build({
        entryPoints: [path.join(temp.dir, "index.ts")],
        bundle: true,
        platform: "node",
        format: "esm",
        outfile: path.join(temp.dir, "dist/bundle.mjs"),
        plugins: [esbuildPlugin()],
      });

      const output = readFileSync(
        path.join(temp.dir, "dist/bundle.mjs"),
        "utf8",
      );

      // dd-trace should be external (imported, not bundled)
      expect(output).toMatch(/import\s+(?:\S.*)?from\s+["']dd-trace["']/);
    });

    it("auto-externalizes @opentelemetry/api", async () => {
      createFixture(temp.dir, {
        "index.ts": `import { trace } from '@opentelemetry/api'; console.log(trace);`,
      });

      await esbuild.build({
        entryPoints: [path.join(temp.dir, "index.ts")],
        bundle: true,
        platform: "node",
        format: "esm",
        outfile: path.join(temp.dir, "dist/bundle.mjs"),
        plugins: [esbuildPlugin()],
      });

      const output = readFileSync(
        path.join(temp.dir, "dist/bundle.mjs"),
        "utf8",
      );

      // @opentelemetry/api should be external
      expect(output).toMatch(
        /import\s+(?:\S.*)?from\s+["']@opentelemetry\/api["']/,
      );
    });

    it("preserves user-specified externals", async () => {
      createFixture(temp.dir, {
        "index.ts": `import express from 'express'; console.log(express);`,
      });

      await esbuild.build({
        entryPoints: [path.join(temp.dir, "index.ts")],
        bundle: true,
        platform: "node",
        format: "esm",
        outfile: path.join(temp.dir, "dist/bundle.mjs"),
        plugins: [esbuildPlugin()],
        external: ["express"],
      });

      const output = readFileSync(
        path.join(temp.dir, "dist/bundle.mjs"),
        "utf8",
      );

      // User-specified external should be preserved
      expect(output).toMatch(/import\s+(?:\S.*)?from\s+["']express["']/);
    });

    it("externalizes @openfeature/core when missing", async () => {
      const require = createRequire(import.meta.url);
      let hasOpenFeature = true;
      try {
        require.resolve("@openfeature/core");
      } catch {
        hasOpenFeature = false;
      }

      createFixture(temp.dir, {
        "index.ts": `import { OpenFeature } from '@openfeature/core'; console.log(OpenFeature);`,
      });

      await esbuild.build({
        entryPoints: [path.join(temp.dir, "index.ts")],
        bundle: true,
        platform: "node",
        format: "esm",
        outfile: path.join(temp.dir, "dist/bundle.mjs"),
        plugins: [esbuildPlugin()],
      });

      const output = readFileSync(
        path.join(temp.dir, "dist/bundle.mjs"),
        "utf8",
      );

      if (!hasOpenFeature) {
        expect(output).toMatch(
          /import\s+(?:\S.*)?from\s+["']@openfeature\/core["']/,
        );
      }
    });
  });

  describe("module filtering", () => {
    it("respects excludeModules option", async () => {
      createFixture(temp.dir, {
        "index.ts": `const pino = require('pino'); console.log(pino);`,
        ...createPinoFixture(),
      });

      await esbuild.build({
        entryPoints: [path.join(temp.dir, "index.ts")],
        bundle: true,
        platform: "node",
        format: "cjs",
        outfile: path.join(temp.dir, "dist/bundle.cjs"),
        plugins: [esbuildPlugin({ excludeModules: ["pino"] })],
      });

      const output = readFileSync(
        path.join(temp.dir, "dist/bundle.cjs"),
        "utf8",
      );

      // Should NOT wrap excluded module
      expectNotInstrumented(output);
    });

    it("respects additionalModules option", async () => {
      createFixture(temp.dir, {
        "index.ts": `const custom = require('custom-pkg'); console.log(custom);`,
        ...createCustomCjsFixture("custom-pkg"),
      });

      await esbuild.build({
        entryPoints: [path.join(temp.dir, "index.ts")],
        bundle: true,
        platform: "node",
        format: "cjs",
        outfile: path.join(temp.dir, "dist/bundle.cjs"),
        plugins: [esbuildPlugin({ additionalModules: ["custom-pkg"] })],
        // dc-polyfill is external since it's not in the test fixture
        external: ["dc-polyfill"],
      });

      const output = readFileSync(
        path.join(temp.dir, "dist/bundle.cjs"),
        "utf8",
      );

      // Should wrap additional module
      expectInstrumented(output);
      expect(output).toContain("custom-pkg");
    });
  });
});
