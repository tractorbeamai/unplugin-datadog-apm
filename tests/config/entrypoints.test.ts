/**
 * Tests for tsdown entrypoint configuration.
 * Verifies that the build config entries match package.json exports.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Read the tsdown config to get entry points
const tsdownConfigPath = path.resolve(__dirname, "../../tsdown.config.ts");
const packageJsonPath = path.resolve(__dirname, "../../package.json");

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
        const sourcePath = path.resolve(__dirname, "../..", source);
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

  describe("tsdown config entries", () => {
    it("tsdown.config.ts exists", () => {
      expect(existsSync(tsdownConfigPath)).toBe(true);
    });

    it("config uses object-style entries with explicit keys", async () => {
      // Read and parse the config file directly to avoid TS import restrictions
      const configContent = readFileSync(tsdownConfigPath, "utf8");

      // Verify it uses object-style entry (not array)
      expect(configContent).toContain("entry: {");
      expect(configContent).not.toMatch(/entry:\s*\[/);

      // Verify all expected entries are present
      for (const [name, { source }] of Object.entries(EXPECTED_ENTRYPOINTS)) {
        const entryPattern = new RegExp(
          `["']?${name.replace("-", "\\-")}["']?:\\s*["']${source}["']`,
        );
        expect(
          configContent,
          `entry "${name}" should map to "${source}"`,
        ).toMatch(entryPattern);
      }
    });

    it("config entry keys match expected entrypoints", () => {
      const configContent = readFileSync(tsdownConfigPath, "utf8");

      // Extract entry keys from the config using regex
      const entryBlockMatch = configContent.match(/entry:\s*{([^}]+)}/s);
      expect(entryBlockMatch).not.toBeNull();

      const entryBlock = entryBlockMatch![1];
      const keyPattern = /["']?([a-z-]+)["']?:\s*["']src\//g;
      const foundKeys: string[] = [];
      let match;
      while ((match = keyPattern.exec(entryBlock)) !== null) {
        foundKeys.push(match[1]);
      }

      const expectedKeys = Object.keys(EXPECTED_ENTRYPOINTS).sort();
      expect(foundKeys.sort()).toEqual(expectedKeys);
    });
  });
});
