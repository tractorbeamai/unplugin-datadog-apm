import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { build } from "vite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import vitePlugin from "../src/vite";
import { createFixture, createTempDir } from "./utils";

/**
 * Find the output file in the dist directory.
 * Vite's output naming can vary, so we search for files matching patterns.
 */
function findOutputFile(distDir: string, pattern: RegExp): string {
  const files = readdirSync(distDir);
  const match = files.find((f) => pattern.test(f));
  if (!match) {
    throw new Error(
      `No file matching ${pattern} found in ${distDir}. Files: ${files.join(", ")}`,
    );
  }
  return path.join(distDir, match);
}

describe("unplugin-datadog-apm (vite)", () => {
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

  describe("plugin metadata", () => {
    it("creates a plugin with correct name", () => {
      const plugin = vitePlugin();
      expect(plugin.name).toBe("unplugin-datadog-apm");
    });

    it("has enforce: pre", () => {
      const plugin = vitePlugin();
      expect(plugin.enforce).toBe("pre");
    });
  });

  describe("vite build", () => {
    // Note: Vite lib mode externalizes node_modules by default.
    // CJS module wrapping is tested via Rollup tests instead.
    // This test verifies the plugin loads without errors in Vite.
    it.skip("wraps CJS modules in Vite build", async () => {
      // Skipped: Vite lib mode externalizes node_modules by default,
      // preventing the plugin from transforming CJS modules.
      // CJS wrapping is covered by rollup.test.ts
    });

    it("creates ESM proxy in Vite build", async () => {
      createFixture(tempDir, {
        "index.js": `import { something } from 'undici'; export { something };`,
        "node_modules/undici/package.json": JSON.stringify({
          name: "undici",
          version: "6.0.0",
          type: "module",
          main: "index.js",
        }),
        "node_modules/undici/index.js": `export const something = () => {};`,
      });

      await build({
        root: tempDir,
        logLevel: "silent",
        build: {
          write: true,
          outDir: path.join(tempDir, "dist"),
          lib: {
            entry: path.join(tempDir, "index.js"),
            formats: ["es"],
            fileName: "bundle",
          },
          rollupOptions: {
            external: ["import-in-the-middle/lib/register.js"],
          },
        },
        plugins: [vitePlugin({ debug: false })],
      });

      const distDir = path.join(tempDir, "dist");
      const outputFile = findOutputFile(distDir, /\.(m?js|es)$/);
      const output = readFileSync(outputFile, "utf8");

      expect(output).toContain("import-in-the-middle/lib/register.js");
      expect(output).toContain("register");
    });

    // Note: additionalModules with CJS is tested via Rollup tests.
    it.skip("respects additionalModules option", async () => {
      // Skipped: Vite lib mode externalizes node_modules by default.
      // additionalModules functionality is covered by rollup.test.ts
    });

    it("respects excludeModules option", async () => {
      createFixture(tempDir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          main: "index.js",
        }),
        "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
      });

      await build({
        root: tempDir,
        logLevel: "silent",
        build: {
          write: true,
          outDir: path.join(tempDir, "dist"),
          lib: {
            entry: path.join(tempDir, "index.js"),
            formats: ["cjs"],
            fileName: "bundle",
          },
          commonjsOptions: {
            include: [/node_modules/],
          },
        },
        ssr: {
          noExternal: ["pino"],
        },
        plugins: [vitePlugin({ debug: false, excludeModules: ["pino"] })],
      });

      const distDir = path.join(tempDir, "dist");
      const outputFile = findOutputFile(distDir, /\.c?js$/);
      const output = readFileSync(outputFile, "utf8");

      expect(output).not.toContain("dd-trace:bundler:load");
    });
  });
});
