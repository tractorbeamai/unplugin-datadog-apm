/**
 * Tests for esbuild integration.
 * Verifies ESM and CJS builds, git metadata injection, and module wrapping.
 */
import { readFileSync } from "node:fs";
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

  describe("externals export", () => {
    it("exports externals list as string array", () => {
      expect(esbuildPlugin.externals).toBeDefined();
      expect(Array.isArray(esbuildPlugin.externals)).toBe(true);
      expect(esbuildPlugin.externals).toContain("dd-trace");
      expect(esbuildPlugin.externals).toContain("dc-polyfill");
      expect(esbuildPlugin.externals).toContain("import-in-the-middle");
      // Should be strings only for esbuild
      expect(esbuildPlugin.externals.every((e) => typeof e === "string")).toBe(
        true,
      );
    });
  });

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
        external: [...esbuildPlugin.externals],
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
        external: [...esbuildPlugin.externals],
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
        external: [...esbuildPlugin.externals],
      });

      const output = readFileSync(
        path.join(temp.dir, "dist/bundle.cjs"),
        "utf8",
      );

      // Should wrap CJS module with dd-trace channel
      expectInstrumented(output);
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
        external: [...esbuildPlugin.externals],
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
