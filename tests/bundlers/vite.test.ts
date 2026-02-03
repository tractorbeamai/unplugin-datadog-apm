import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { build } from "vite";
import { describe, expect, it } from "vitest";

import vitePlugin from "../../src/vite";
import {
  expectIitmProxyInjected,
  expectNotInstrumented,
} from "../helpers/assertions";
import { useTempDir } from "../helpers/temp-dir";
import { createFixture } from "../utils";

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
  const temp = useTempDir();

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
    it("creates ESM proxy in Vite build", async () => {
      createFixture(temp.dir, {
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
        root: temp.dir,
        logLevel: "silent",
        build: {
          write: true,
          outDir: path.join(temp.dir, "dist"),
          lib: {
            entry: path.join(temp.dir, "index.js"),
            formats: ["es"],
            fileName: "bundle",
          },
          rollupOptions: {
            external: ["import-in-the-middle/lib/register.js"],
          },
        },
        plugins: [vitePlugin({ debug: false, autoInit: false })],
      });

      const distDir = path.join(temp.dir, "dist");
      const outputFile = findOutputFile(distDir, /\.(m?js|es)$/);
      const output = readFileSync(outputFile, "utf8");

      expectIitmProxyInjected(output);
    });

    it("respects excludeModules option", async () => {
      createFixture(temp.dir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        "node_modules/pino/package.json": JSON.stringify({
          name: "pino",
          version: "8.0.0",
          main: "index.js",
        }),
        "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
      });

      await build({
        root: temp.dir,
        logLevel: "silent",
        build: {
          write: true,
          outDir: path.join(temp.dir, "dist"),
          lib: {
            entry: path.join(temp.dir, "index.js"),
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
        plugins: [
          vitePlugin({
            debug: false,
            autoInit: false,
            excludeModules: ["pino"],
          }),
        ],
      });

      const distDir = path.join(temp.dir, "dist");
      const outputFile = findOutputFile(distDir, /\.c?js$/);
      const output = readFileSync(outputFile, "utf8");

      expectNotInstrumented(output);
    });
  });
});
