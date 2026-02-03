import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ddTraceHooks,
  extractPackageAndModulePath,
  isESMFile,
} from "../../src/core/dd-trace";

describe("dd-trace integration helpers", () => {
  it("exposes the dd-trace instrumentation hook set", () => {
    expect(ddTraceHooks.size).toBeGreaterThan(0);
    expect(ddTraceHooks.has("http")).toBe(true);
  });

  it("extracts package metadata for a dd-trace path", () => {
    const require = createRequire(import.meta.url);
    const ddTracePath = require.resolve("dd-trace/package.json");
    const extracted = extractPackageAndModulePath(ddTracePath);

    expect(extracted).not.toBeNull();
    expect(extracted?.pkg).toBe("dd-trace");
  });

  it("returns null for paths outside node_modules", () => {
    const filePath = path.join(process.cwd(), "src", "index.ts");
    expect(extractPackageAndModulePath(filePath)).toBeNull();
  });

  it("delegates ESM detection to dd-trace logic", () => {
    expect(isESMFile("/tmp/example.mjs")).toBe(true);
    expect(isESMFile("/tmp/example.cjs")).toBe(false);
  });
});
