/**
 * Unit tests for constants and serialization utilities.
 */
import { describe, expect, it } from "vitest";

import {
  CHANNEL,
  DD_TRACE_INIT_BANNER,
  ENTRY_WRAPPER_PREFIX,
  ESM_PROXY_SUFFIX,
  IITM_EXCLUSION_PATTERNS,
  INIT_MODULE,
  NODE_MODULES,
  serializeExclusionsToCode,
} from "../../src/core/constants";

describe("constants", () => {
  describe("IITM_EXCLUSION_PATTERNS", () => {
    it("is an array of RegExp patterns", () => {
      expect(Array.isArray(IITM_EXCLUSION_PATTERNS)).toBe(true);
      for (const pattern of IITM_EXCLUSION_PATTERNS) {
        expect(pattern).toBeInstanceOf(RegExp);
      }
    });

    it("includes langsmith pattern", () => {
      const langsmithPattern = IITM_EXCLUSION_PATTERNS.find((p) =>
        p.toString().includes("langsmith"),
      );
      expect(langsmithPattern).toBeDefined();
      expect(langsmithPattern?.test("langsmith")).toBe(true);
      expect(langsmithPattern?.test("@langchain/langsmith")).toBe(true);
    });

    it("includes openai shims patterns", () => {
      const hasOpenaiShims = IITM_EXCLUSION_PATTERNS.some((p) =>
        p.toString().includes("openai"),
      );
      expect(hasOpenaiShims).toBe(true);

      const shimsPattern = IITM_EXCLUSION_PATTERNS.find(
        (p) => p.toString() === String.raw`/openai\/_shims/`,
      );
      expect(shimsPattern?.test("openai/_shims")).toBe(true);
      expect(shimsPattern?.test("openai/_shims/node")).toBe(true);
    });

    it("includes anthropic shims pattern", () => {
      const anthropicPattern = IITM_EXCLUSION_PATTERNS.find((p) =>
        p.toString().includes("anthropic"),
      );
      expect(anthropicPattern).toBeDefined();
      expect(anthropicPattern?.test("@anthropic-ai/sdk/_shims")).toBe(true);
    });
  });

  describe("serializeExclusionsToCode", () => {
    it("returns a JavaScript array string", () => {
      const code = serializeExclusionsToCode();

      expect(code.startsWith("[")).toBe(true);
      expect(code.endsWith("]")).toBe(true);
    });

    it("contains regex literals (not strings)", () => {
      const code = serializeExclusionsToCode();

      // Should contain regex syntax like /pattern/, not "pattern"
      expect(code).toContain("/langsmith/");
      expect(code).not.toContain('"/langsmith/"');
      expect(code).not.toContain("'/langsmith/'");
    });

    it("produces valid JavaScript code", () => {
      const code = serializeExclusionsToCode();

      // This should not throw
      const result = eval(code) as unknown[];
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(IITM_EXCLUSION_PATTERNS.length);

      // Each element should be a RegExp
      for (const item of result) {
        expect(item).toBeInstanceOf(RegExp);
      }
    });

    it("preserves regex escaping", () => {
      const code = serializeExclusionsToCode();

      // The escaped slash in openai/_shims should be preserved
      expect(code).toContain(String.raw`\/`);
    });
  });

  describe("module identifiers", () => {
    it("CHANNEL is correct diagnostic channel name", () => {
      expect(CHANNEL).toBe("dd-trace:bundler:load");
    });

    it("ESM_PROXY_SUFFIX is correct proxy suffix", () => {
      expect(ESM_PROXY_SUFFIX).toBe("?__dd_esm_proxy__");
    });

    it("ENTRY_WRAPPER_PREFIX is correct virtual module prefix", () => {
      expect(ENTRY_WRAPPER_PREFIX).toBe("\0dd-entry:");
    });

    it("INIT_MODULE is correct init specifier", () => {
      expect(INIT_MODULE).toBe("unplugin-datadog-apm/init");
    });

    it("NODE_MODULES is correct path segment", () => {
      expect(NODE_MODULES).toBe("node_modules/");
    });
  });

  describe("DD_TRACE_INIT_BANNER", () => {
    it("imports the init module", () => {
      expect(DD_TRACE_INIT_BANNER).toContain("unplugin-datadog-apm/init");
    });

    it("uses import syntax", () => {
      expect(DD_TRACE_INIT_BANNER).toContain("import");
    });

    it("includes comment about auto-injection", () => {
      expect(DD_TRACE_INIT_BANNER).toContain("Auto-injected");
    });
  });
});
