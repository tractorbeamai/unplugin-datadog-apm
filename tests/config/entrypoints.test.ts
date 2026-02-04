/**
 * Tests for tsdown entrypoint configuration.
 * Verifies that the build config entries match package.json exports.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.resolve(moduleDir, "../../package.json");

/**
 * Expected entrypoints with their export paths and source files.
 */
const EXPECTED_ENTRYPOINTS = {
  index: { exportPath: ".", source: "src/index.ts" },
  api: { exportPath: "./api", source: "src/api.ts" },
  esbuild: { exportPath: "./esbuild", source: "src/esbuild.ts" },
  init: { exportPath: "./init", source: "src/init.ts" },
  "nitro-plugin": {
    exportPath: "./nitro-plugin",
    source: "src/nitro-plugin.ts",
  },
  register: { exportPath: "./register", source: "src/register.ts" },
  "register-helpers": {
    exportPath: "./register-helpers",
    source: "src/register-helpers.ts",
  },
  rolldown: { exportPath: "./rolldown", source: "src/rolldown.ts" },
  rollup: { exportPath: "./rollup", source: "src/rollup.ts" },
  rspack: { exportPath: "./rspack", source: "src/rspack.ts" },
  vite: { exportPath: "./vite", source: "src/vite.ts" },
  webpack: { exportPath: "./webpack", source: "src/webpack.ts" },
} as const;

describe("entrypoint configuration", () => {
  describe("source files exist", () => {
    it.each(Object.entries(EXPECTED_ENTRYPOINTS))(
      "source file exists for %s entrypoint",
      (name, { source }) => {
        const sourcePath = path.resolve(moduleDir, "../..", source);
        expect(existsSync(sourcePath), `${source} should exist`).toBe(true);
      },
    );
  });

  describe("package.json exports", () => {
    const packageJson = JSON.parse(
      readFileSync(packageJsonPath, "utf8"),
    ) as Record<string, unknown>;
    const exports = packageJson.exports as Record<string, string>;

    it("has exports field", () => {
      expect(exports).toBeDefined();
      expect(typeof exports).toBe("object");
    });

    it.each(Object.entries(EXPECTED_ENTRYPOINTS))(
      "exports %s entrypoint at correct path",
      (name, { exportPath }) => {
        expect(exports[exportPath]).toBeDefined();
        expect(exports[exportPath]).toContain(`./dist/${name}`);
      },
    );

    it("exports package.json", () => {
      expect(exports["./package.json"]).toBe("./package.json");
    });

    it("has exactly the expected number of exports", () => {
      const expectedExportCount = Object.keys(EXPECTED_ENTRYPOINTS).length + 1; // +1 for ./package.json
      expect(Object.keys(exports).length).toBe(expectedExportCount);
    });
  });

  describe("package.json typesVersions", () => {
    const packageJson = JSON.parse(
      readFileSync(packageJsonPath, "utf8"),
    ) as Record<string, unknown>;
    const typesVersions = packageJson.typesVersions as Record<
      string,
      Record<string, string[]>
    >;

    it("has typesVersions field", () => {
      expect(typesVersions).toBeDefined();
      expect(typesVersions["*"]).toBeDefined();
    });

    it.each(Object.entries(EXPECTED_ENTRYPOINTS))(
      "has types for %s entrypoint",
      (name, { exportPath }) => {
        const typePath = exportPath === "." ? "." : exportPath.slice(2); // Remove "./"
        const types = typesVersions["*"][typePath];
        expect(types).toBeDefined();
        expect(types[0]).toContain(`./dist/${name}`);
      },
    );
  });
});
