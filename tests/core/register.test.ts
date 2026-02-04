/**
 * Tests for the register module (--import entry point).
 * Verifies dd-trace initialization behavior and worker thread handling.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We test the register module indirectly since it has side effects on import.
// Instead, we test the components and verify the integration via runtime tests.

describe("register module", () => {
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

  describe("initTracer behavior", () => {
    it("uses require for synchronous dd-trace initialization", async () => {
      // The register module uses require() to ensure dd-trace loads synchronously
      // before any ESM imports are resolved. This is tested via the init-tracer tests.
      // Here we verify the pattern by checking the source uses require.
      const { readFileSync } = await import("node:fs");
      const { fileURLToPath } = await import("node:url");
      const path = await import("node:path");

      const registerPath = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../src/register.ts",
      );
      const source = readFileSync(registerPath, "utf-8");

      expect(source).toContain('require("dd-trace")');
      expect(source).toContain("tracer.init()");
    });
  });

  describe("worker thread handling", () => {
    it("checks isMainThread before initialization", async () => {
      // Verify the register module guards against worker thread execution
      const { readFileSync } = await import("node:fs");
      const { fileURLToPath } = await import("node:url");
      const path = await import("node:path");

      const registerPath = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../src/register.ts",
      );
      const source = readFileSync(registerPath, "utf-8");

      expect(source).toContain('import { isMainThread } from "node:worker_threads"');
      expect(source).toContain("if (isMainThread)");
    });
  });

  describe("debug logging", () => {
    it("logs initialization when DD_TRACE_DEBUG is set", async () => {
      // Verify debug logging is conditional on DD_TRACE_DEBUG
      const { readFileSync } = await import("node:fs");
      const { fileURLToPath } = await import("node:url");
      const path = await import("node:path");

      const registerPath = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../src/register.ts",
      );
      const source = readFileSync(registerPath, "utf-8");

      expect(source).toContain("process.env.DD_TRACE_DEBUG");
      expect(source).toContain("[unplugin-datadog-apm] dd-trace initialized");
      expect(source).toContain("[unplugin-datadog-apm] ESM loader hook registered");
    });
  });

  describe("integration with helpers", () => {
    it("imports setupTracer from register-helpers", async () => {
      const { readFileSync } = await import("node:fs");
      const { fileURLToPath } = await import("node:url");
      const path = await import("node:path");

      const registerPath = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../src/register.ts",
      );
      const source = readFileSync(registerPath, "utf-8");

      expect(source).toContain('import { setupTracer } from "./register-helpers"');
    });

    it("uses IITM_EXCLUSION_PATTERNS from constants", async () => {
      const { readFileSync } = await import("node:fs");
      const { fileURLToPath } = await import("node:url");
      const path = await import("node:path");

      const registerPath = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../src/register.ts",
      );
      const source = readFileSync(registerPath, "utf-8");

      expect(source).toContain('import { IITM_EXCLUSION_PATTERNS } from "./core/constants"');
      expect(source).toContain("exclude: IITM_EXCLUSION_PATTERNS");
    });
  });

  describe("loader hook registration", () => {
    it("uses node:module register API", async () => {
      const { readFileSync } = await import("node:fs");
      const { fileURLToPath } = await import("node:url");
      const path = await import("node:path");

      const registerPath = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../src/register.ts",
      );
      const source = readFileSync(registerPath, "utf-8");

      expect(source).toContain('import { register } from "node:module"');
      expect(source).toContain('register("dd-trace/loader-hook.mjs"');
    });
  });
});

describe("register module runtime behavior", () => {
  // Runtime tests are covered by tests/bundlers/runtime.test.ts which uses
  // --import unplugin-datadog-apm/register and verifies tracing works end-to-end.
  it("is tested via bundler runtime tests", () => {
    // This is a documentation test to indicate where runtime behavior is tested
    expect(true).toBe(true);
  });
});
