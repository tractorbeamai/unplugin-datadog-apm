/**
 * Tests for esbuild integration.
 * Verifies ESM and CJS builds, auto-externalization, banner injection, and module wrapping.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
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

interface EsbuildBehaviorSignature {
  hasChannel: boolean;
  hasCreateRequire: boolean;
  hasLoaderHook: boolean;
  hasModuleRegister: boolean;
  hasPathToFileURL: boolean;
  hasTracerProvider: boolean;
}

interface EsbuildParitySignature {
  hasChannel: boolean;
  hasCreateRequire?: boolean;
}

interface EsbuildPluginModule {
  name: string;
  setup: esbuild.Plugin["setup"];
}

const ddTraceRequire = createRequire(import.meta.url);
const ddTracePluginPath = path.join(
  os.homedir(),
  ".claude/references/dd-trace/packages/datadog-esbuild/index.js",
);
const hasDdTracePluginReference = existsSync(ddTracePluginPath);

/**
 * Load the dd-trace esbuild plugin from the local reference checkout.
 * @param referencePath Absolute path to the dd-trace plugin entry.
 * @returns An esbuild-compatible plugin instance.
 */
function loadDdTracePlugin(referencePath: string): esbuild.Plugin {
  const plugin = ddTraceRequire(referencePath) as EsbuildPluginModule;
  return { name: plugin.name, setup: plugin.setup };
}

/**
 * Build an esbuild bundle with consistent defaults.
 * @param options Bundle configuration for the test build.
 * @returns Promise resolved once the bundle is written.
 */
async function buildBundle(options: {
  entryPath: string;
  external?: string[];
  format: "cjs" | "esm";
  outfile: string;
  plugin: esbuild.Plugin;
}): Promise<void> {
  await esbuild.build({
    entryPoints: [options.entryPath],
    bundle: true,
    platform: "node",
    format: options.format,
    outfile: options.outfile,
    plugins: [options.plugin],
    external: options.external,
  });
}

/**
 * Collect key behavior signals from esbuild output.
 * @param output Bundle output text.
 * @returns A signature used for parity comparison.
 */
function collectEsbuildBehavior(output: string): EsbuildBehaviorSignature {
  return {
    hasChannel: output.includes("dd-trace:bundler:load"),
    hasCreateRequire: output.includes("createRequire"),
    hasLoaderHook: output.includes("loader-hook.mjs"),
    hasModuleRegister: output.includes("Module.register"),
    hasPathToFileURL: output.includes("pathToFileURL"),
    hasTracerProvider: output.includes("TracerProvider"),
  };
}

/**
 * Reduce the behavior signals to the parity surface we compare.
 * @param behavior - Full behavior signature extracted from output.
 * @param format - Output format to tailor expected parity.
 * @returns Reduced signature for parity comparison.
 */
function getParitySignature(
  behavior: EsbuildBehaviorSignature,
  format: "cjs" | "esm",
): EsbuildParitySignature {
  return format === "esm"
    ? {
        hasChannel: behavior.hasChannel,
        hasCreateRequire: behavior.hasCreateRequire,
      }
    : {
        hasChannel: behavior.hasChannel,
      };
}

describe("unplugin-datadog-apm (esbuild)", () => {
  const temp = useTempDir();

  describe("ESM builds", () => {
    it("injects init banner with createRequire", async () => {
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

      // Should have createRequire for ESM compatibility
      expect(output).toContain("createRequire");
      expect(output).toContain("import.meta.url");
      expect(output).toContain("__ddFilename");
      expect(output).toContain("__ddDirname");

      // Should have init code
      expect(output).toContain("dd-trace");
      expect(output).toContain("isMainThread");
      expect(output).toContain("TracerProvider");
    });

    it("injects ESM loader hook registration", async () => {
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

      // Should register ESM loader hook
      expect(output).toContain("Module.register");
      expect(output).toContain("loader-hook.mjs");
    });

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

    it("skips init banner when autoInit is false", async () => {
      createFixture(temp.dir, {
        "index.ts": `console.log("hello");`,
      });

      await esbuild.build({
        entryPoints: [path.join(temp.dir, "index.ts")],
        bundle: true,
        platform: "node",
        format: "esm",
        outfile: path.join(temp.dir, "dist/bundle.mjs"),
        plugins: [esbuildPlugin({ autoInit: false })],
      });

      const output = readFileSync(
        path.join(temp.dir, "dist/bundle.mjs"),
        "utf8",
      );

      // Should still have createRequire for CJS wrapper compatibility
      expect(output).toContain("createRequire");

      // Should NOT have init code
      expect(output).not.toContain("TracerProvider");
      expect(output).not.toContain("loader-hook.mjs");
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

    it("injects init banner", async () => {
      createFixture(temp.dir, {
        "index.ts": `console.log("hello");`,
      });

      await esbuild.build({
        entryPoints: [path.join(temp.dir, "index.ts")],
        bundle: true,
        platform: "node",
        format: "cjs",
        outfile: path.join(temp.dir, "dist/bundle.cjs"),
        plugins: [esbuildPlugin()],
      });

      const output = readFileSync(
        path.join(temp.dir, "dist/bundle.cjs"),
        "utf8",
      );

      // Should have init code
      expect(output).toContain("dd-trace");
      expect(output).toContain("isMainThread");
      expect(output).toContain("TracerProvider");
    });

    it("injects ESM loader hook registration for CJS", async () => {
      createFixture(temp.dir, {
        "index.ts": `console.log("hello");`,
      });

      await esbuild.build({
        entryPoints: [path.join(temp.dir, "index.ts")],
        bundle: true,
        platform: "node",
        format: "cjs",
        outfile: path.join(temp.dir, "dist/bundle.cjs"),
        plugins: [esbuildPlugin()],
      });

      const output = readFileSync(
        path.join(temp.dir, "dist/bundle.cjs"),
        "utf8",
      );

      // Should register ESM loader hook (for external ESM modules)
      expect(output).toContain("Module.register");
      expect(output).toContain("loader-hook.mjs");
      expect(output).toContain("pathToFileURL");
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

    it("skips init banner when autoInit is false", async () => {
      createFixture(temp.dir, {
        "index.ts": `console.log("hello");`,
      });

      await esbuild.build({
        entryPoints: [path.join(temp.dir, "index.ts")],
        bundle: true,
        platform: "node",
        format: "cjs",
        outfile: path.join(temp.dir, "dist/bundle.cjs"),
        plugins: [esbuildPlugin({ autoInit: false })],
      });

      const output = readFileSync(
        path.join(temp.dir, "dist/bundle.cjs"),
        "utf8",
      );

      // Should NOT have init code
      expect(output).not.toContain("TracerProvider");
      expect(output).not.toContain("loader-hook.mjs");
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

  describe("IITM exclusions", () => {
    it("includes IITM exclusions in init banner", async () => {
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

      // Should include IITM exclusions for problematic packages
      expect(output).toContain("langsmith");
      expect(output).toContain("openai");
      expect(output).toContain("anthropic");
    });
  });

  describe("multiple entry points", () => {
    it("adds banner to all entry points", async () => {
      createFixture(temp.dir, {
        "entry1.ts": `console.log("entry1");`,
        "entry2.ts": `console.log("entry2");`,
      });

      await esbuild.build({
        entryPoints: [
          path.join(temp.dir, "entry1.ts"),
          path.join(temp.dir, "entry2.ts"),
        ],
        bundle: true,
        platform: "node",
        format: "esm",
        outdir: path.join(temp.dir, "dist"),
        plugins: [esbuildPlugin()],
      });

      const output1 = readFileSync(
        path.join(temp.dir, "dist/entry1.js"),
        "utf8",
      );
      const output2 = readFileSync(
        path.join(temp.dir, "dist/entry2.js"),
        "utf8",
      );

      // Both outputs should have init code
      expect(output1).toContain("dd-trace");
      expect(output2).toContain("dd-trace");
    });
  });

  const parityDescribe = hasDdTracePluginReference ? describe : describe.skip;

  parityDescribe("dd-trace parity", () => {
    it("matches ESM behavior signals", async () => {
      createFixture(temp.dir, {
        "index.ts": `import pino from 'pino'; console.log(pino);`,
        ...createPinoFixture(),
      });

      const entryPath = path.join(temp.dir, "index.ts");
      const ourOutfile = path.join(temp.dir, "dist/parity-esm-ours.mjs");
      const ddOutfile = path.join(temp.dir, "dist/parity-esm-ddtrace.mjs");

      await buildBundle({
        entryPath,
        format: "esm",
        outfile: ourOutfile,
        plugin: esbuildPlugin({ autoInit: true }),
        external: ["dc-polyfill"],
      });

      await buildBundle({
        entryPath,
        format: "esm",
        outfile: ddOutfile,
        plugin: loadDdTracePlugin(ddTracePluginPath),
        external: ["dc-polyfill"],
      });

      const ourOutput = readFileSync(ourOutfile, "utf8");
      const ddOutput = readFileSync(ddOutfile, "utf8");
      const ourBehavior = collectEsbuildBehavior(ourOutput);
      const ddBehavior = collectEsbuildBehavior(ddOutput);

      expectInstrumented(ourOutput);
      expectInstrumented(ddOutput);
      expect(getParitySignature(ourBehavior, "esm")).toEqual(
        getParitySignature(ddBehavior, "esm"),
      );
    });

    it("matches CJS behavior signals", async () => {
      createFixture(temp.dir, {
        "index.ts": `const pino = require('pino'); console.log(pino);`,
        ...createPinoFixture(),
      });

      const entryPath = path.join(temp.dir, "index.ts");
      const ourOutfile = path.join(temp.dir, "dist/parity-cjs-ours.cjs");
      const ddOutfile = path.join(temp.dir, "dist/parity-cjs-ddtrace.cjs");

      await buildBundle({
        entryPath,
        format: "cjs",
        outfile: ourOutfile,
        plugin: esbuildPlugin({ autoInit: true }),
        external: ["dc-polyfill"],
      });

      await buildBundle({
        entryPath,
        format: "cjs",
        outfile: ddOutfile,
        plugin: loadDdTracePlugin(ddTracePluginPath),
        external: ["dc-polyfill"],
      });

      const ourOutput = readFileSync(ourOutfile, "utf8");
      const ddOutput = readFileSync(ddOutfile, "utf8");
      const ourBehavior = collectEsbuildBehavior(ourOutput);
      const ddBehavior = collectEsbuildBehavior(ddOutput);

      expectInstrumented(ourOutput);
      expectInstrumented(ddOutput);
      expect(getParitySignature(ourBehavior, "cjs")).toEqual(
        getParitySignature(ddBehavior, "cjs"),
      );
    });
  });
});
