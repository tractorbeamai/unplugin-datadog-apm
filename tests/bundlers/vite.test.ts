import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { build } from "vite";
import { describe, expect, it } from "vitest";

import vitePlugin from "../../src/vite";
import {
  expectIitmProxyInjected,
  expectNotInstrumented,
} from "../helpers/assertions";
import { createPinoFixture, createUndiciFixture } from "../helpers/fixtures";
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

  describe("externals export", () => {
    it("exports externals list as string array", () => {
      expect(vitePlugin.externals).toBeDefined();
      expect(Array.isArray(vitePlugin.externals)).toBe(true);
      expect(vitePlugin.externals).toContain("dd-trace");
      expect(vitePlugin.externals).toContain("dc-polyfill");
      expect(vitePlugin.externals).toContain("import-in-the-middle");
      // Should be strings only for vite
      expect(vitePlugin.externals.every((e) => typeof e === "string")).toBe(
        true,
      );
    });
  });

  describe("vite build", () => {
    it("creates ESM proxy in Vite build", async () => {
      createFixture(temp.dir, {
        "index.js": `import { something } from 'undici'; export { something };`,
        ...createUndiciFixture(),
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
            external: [...vitePlugin.externals],
          },
        },
        plugins: [vitePlugin({ debug: false })],
      });

      const distDir = path.join(temp.dir, "dist");
      const outputFile = findOutputFile(distDir, /\.(m?js|es)$/);
      const output = readFileSync(outputFile, "utf8");

      expectIitmProxyInjected(output);
    });

    it("respects excludeModules option", async () => {
      createFixture(temp.dir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        ...createPinoFixture(),
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
          rollupOptions: {
            external: [...vitePlugin.externals],
          },
        },
        ssr: {
          noExternal: ["pino"],
        },
        plugins: [
          vitePlugin({
            debug: false,
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
