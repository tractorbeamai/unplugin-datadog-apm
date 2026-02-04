/**
 * Unit tests for module resolution utilities.
 */
import { builtinModules } from "node:module";

import { describe, expect, it } from "vitest";

import { BUILTINS, getBaseModuleName } from "../../src/core/resolve";

describe("BUILTINS", () => {
  it("includes all Node.js builtin modules", () => {
    for (const mod of builtinModules) {
      expect(BUILTINS.has(mod)).toBe(true);
    }
  });

  it("includes node: prefixed versions", () => {
    for (const mod of builtinModules) {
      expect(BUILTINS.has(`node:${mod}`)).toBe(true);
    }
  });

  it("includes common builtins", () => {
    expect(BUILTINS.has("fs")).toBe(true);
    expect(BUILTINS.has("node:fs")).toBe(true);
    expect(BUILTINS.has("path")).toBe(true);
    expect(BUILTINS.has("node:path")).toBe(true);
    expect(BUILTINS.has("http")).toBe(true);
    expect(BUILTINS.has("node:http")).toBe(true);
    expect(BUILTINS.has("crypto")).toBe(true);
    expect(BUILTINS.has("node:crypto")).toBe(true);
  });

  it("does not include non-builtins", () => {
    expect(BUILTINS.has("express")).toBe(false);
    expect(BUILTINS.has("lodash")).toBe(false);
    expect(BUILTINS.has("node:express")).toBe(false);
  });
});

describe("getBaseModuleName", () => {
  describe("regular packages", () => {
    it("returns the package name for simple imports", () => {
      expect(getBaseModuleName("lodash")).toBe("lodash");
      expect(getBaseModuleName("express")).toBe("express");
      expect(getBaseModuleName("pino")).toBe("pino");
    });

    it("extracts base name from subpath imports", () => {
      expect(getBaseModuleName("lodash/get")).toBe("lodash");
      expect(getBaseModuleName("lodash/fp/get")).toBe("lodash");
      expect(getBaseModuleName("pino/file")).toBe("pino");
    });

    it("handles deeply nested paths", () => {
      expect(getBaseModuleName("pkg/a/b/c/d")).toBe("pkg");
    });
  });

  describe("scoped packages", () => {
    it("returns full scope/name for scoped packages", () => {
      expect(getBaseModuleName("@scope/pkg")).toBe("@scope/pkg");
      expect(getBaseModuleName("@aws-sdk/client-s3")).toBe(
        "@aws-sdk/client-s3",
      );
      expect(getBaseModuleName("@types/node")).toBe("@types/node");
    });

    it("extracts base name from scoped package subpaths", () => {
      expect(getBaseModuleName("@scope/pkg/utils")).toBe("@scope/pkg");
      expect(getBaseModuleName("@aws-sdk/client-s3/commands")).toBe(
        "@aws-sdk/client-s3",
      );
    });

    it("handles deeply nested scoped package paths", () => {
      expect(getBaseModuleName("@org/pkg/a/b/c")).toBe("@org/pkg");
    });
  });

  describe("edge cases", () => {
    it("handles empty string", () => {
      // Should return empty string or undefined-ish behavior
      const result = getBaseModuleName("");
      expect(result).toBe("");
    });

    it("handles strings starting with @ but no slash", () => {
      // Edge case: malformed scoped package
      const result = getBaseModuleName("@incomplete");
      expect(result).toBe("@incomplete");
    });

    it("handles node: prefixed builtins", () => {
      // These should be handled elsewhere, but test the function behavior
      expect(getBaseModuleName("node:fs")).toBe("node:fs");
      expect(getBaseModuleName("node:path")).toBe("node:path");
    });
  });
});
