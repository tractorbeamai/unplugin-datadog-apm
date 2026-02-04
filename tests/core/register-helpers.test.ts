/**
 * Tests for the register-helpers module.
 * Verifies TracerProvider setup and ESM loader hook registration.
 */
import { createRequire } from "node:module";

import type { Tracer } from "dd-trace";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IITM_EXCLUSION_PATTERNS } from "../../src/core/constants";
import {
  IITM_EXCLUSION_PATTERNS as ReexportedPatterns,
  registerLoaderHook,
  setupESMImports,
  setupOpenTelemetry,
  setupTracer,
} from "../../src/register-helpers";

// Partially mock node:module to avoid actual loader registration
vi.mock("node:module", async (importOriginal) => {
  const actual = await importOriginal();
  return Object.assign({}, actual, { register: vi.fn() });
});

const require = createRequire(import.meta.url);
const tracer = require("dd-trace") as Tracer;

describe("register-helpers", () => {
  const originalEnv = process.env.DD_TRACE_DEBUG;

  beforeEach(() => {
    delete process.env.DD_TRACE_DEBUG;
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.DD_TRACE_DEBUG;
    } else {
      process.env.DD_TRACE_DEBUG = originalEnv;
    }
  });

  describe("setupOpenTelemetry", () => {
    it("registers TracerProvider without throwing", () => {
      expect(() => {
        setupOpenTelemetry(tracer);
      }).not.toThrow();
    });

    it("logs when DD_TRACE_DEBUG is set", () => {
      process.env.DD_TRACE_DEBUG = "true";
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => null);

      setupOpenTelemetry(tracer);

      expect(logSpy).toHaveBeenCalledWith(
        "[unplugin-datadog-apm] TracerProvider registered with OTel API",
      );

      logSpy.mockRestore();
    });

    it("does not log when DD_TRACE_DEBUG is not set", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => null);

      setupOpenTelemetry(tracer);

      expect(logSpy).not.toHaveBeenCalled();

      logSpy.mockRestore();
    });
  });

  describe("setupTracer (deprecated alias)", () => {
    it("is an alias for setupOpenTelemetry", () => {
      expect(setupTracer).toBe(setupOpenTelemetry);
    });
  });

  describe("setupESMImports", () => {
    it("registers the dd-trace loader hook with default exclusions", async () => {
      const { register } = await import("node:module");

      setupESMImports();

      expect(register).toHaveBeenCalledTimes(1);
      expect(register).toHaveBeenCalledWith(
        "dd-trace/loader-hook.mjs",
        expect.any(String),
        { data: { exclude: IITM_EXCLUSION_PATTERNS } },
      );
    });

    it("accepts custom exclusion patterns", async () => {
      const { register } = await import("node:module");
      const customExclusions = [/custom-pattern/, /another-pattern/];

      setupESMImports(customExclusions);

      expect(register).toHaveBeenCalledWith(
        "dd-trace/loader-hook.mjs",
        expect.any(String),
        { data: { exclude: customExclusions } },
      );
    });

    it("logs when DD_TRACE_DEBUG is set", () => {
      process.env.DD_TRACE_DEBUG = "true";
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => null);

      setupESMImports();

      expect(logSpy).toHaveBeenCalledWith(
        "[unplugin-datadog-apm] ESM loader hook registered",
      );

      logSpy.mockRestore();
    });

    it("does not log when DD_TRACE_DEBUG is not set", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => null);

      setupESMImports();

      expect(logSpy).not.toHaveBeenCalled();

      logSpy.mockRestore();
    });
  });

  describe("registerLoaderHook (deprecated alias)", () => {
    it("is an alias for setupESMImports", () => {
      expect(registerLoaderHook).toBe(setupESMImports);
    });
  });

  describe("IITM_EXCLUSION_PATTERNS re-export", () => {
    it("re-exports IITM_EXCLUSION_PATTERNS from constants", () => {
      expect(ReexportedPatterns).toBe(IITM_EXCLUSION_PATTERNS);
    });

    it("contains expected default patterns", () => {
      expect(IITM_EXCLUSION_PATTERNS).toBeInstanceOf(Array);
      expect(IITM_EXCLUSION_PATTERNS.length).toBeGreaterThan(0);
      expect(IITM_EXCLUSION_PATTERNS.every((p) => p instanceof RegExp)).toBe(
        true,
      );
    });
  });
});
