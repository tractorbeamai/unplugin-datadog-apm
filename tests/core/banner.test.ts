/**
 * Unit tests for banner generation.
 * Tests ESM and CJS init banner code generation.
 */
import { describe, expect, it } from "vitest";

import {
  generateCJSInitBanner,
  generateESMInitBanner,
} from "../../src/core/banner";

describe("banner generation", () => {
  describe("generateESMInitBanner", () => {
    describe("when autoInit is false", () => {
      it("returns minimal ESM preamble", () => {
        const banner = generateESMInitBanner(false);

        expect(banner).toContain('import * as __Module from "node:module"');
        expect(banner).toContain(
          'import { createRequire as __createRequire } from "node:module"',
        );
        expect(banner).toContain(
          "const require = __createRequire(import.meta.url)",
        );
      });

      it("does not include worker_threads import", () => {
        const banner = generateESMInitBanner(false);

        expect(banner).not.toContain("worker_threads");
        expect(banner).not.toContain("__isMainThread");
      });

      it("does not include dd-trace initialization", () => {
        const banner = generateESMInitBanner(false);

        expect(banner).not.toContain("dd-trace");
        expect(banner).not.toContain("__tracer");
        expect(banner).not.toContain("TracerProvider");
      });

      it("does not include IITM exclusions", () => {
        const banner = generateESMInitBanner(false);

        expect(banner).not.toContain("__iitmExclusions");
        expect(banner).not.toContain("langsmith");
      });
    });

    describe("when autoInit is true", () => {
      it("includes worker_threads import for main thread check", () => {
        const banner = generateESMInitBanner(true);

        expect(banner).toContain(
          'import { isMainThread as __isMainThread } from "node:worker_threads"',
        );
      });

      it("includes import.meta.url as base URL", () => {
        const banner = generateESMInitBanner(true);

        expect(banner).toContain("const __baseUrl = import.meta.url");
      });

      it("includes IITM exclusion patterns", () => {
        const banner = generateESMInitBanner(true);

        expect(banner).toContain("__iitmExclusions");
        expect(banner).toContain("/langsmith/");
        expect(banner).toContain(String.raw`/openai\/_shims/`);
      });

      it("includes dd-trace initialization code", () => {
        const banner = generateESMInitBanner(true);

        expect(banner).toContain('require("dd-trace")');
        expect(banner).toContain("__tracer.init()");
        expect(banner).toContain("new __tracer.TracerProvider()");
        expect(banner).toContain("__tracerProvider.register()");
      });

      it("includes ESM loader hook registration", () => {
        const banner = generateESMInitBanner(true);

        expect(banner).toContain('typeof __Module.register === "function"');
        expect(banner).toContain('require.resolve("dd-trace/loader-hook.mjs")');
        expect(banner).toContain("exclude: __iitmExclusions");
      });

      it("wraps init code in main thread check", () => {
        const banner = generateESMInitBanner(true);

        expect(banner).toContain("if (__isMainThread)");
      });

      it("includes debug logging with DD_TRACE_DEBUG check", () => {
        const banner = generateESMInitBanner(true);

        expect(banner).toContain("process.env.DD_TRACE_DEBUG");
        expect(banner).toContain("[dd-trace] initialized");
        expect(banner).toContain("[dd-trace] TracerProvider registered");
        expect(banner).toContain("[dd-trace] ESM loader hook registered");
      });
    });
  });

  describe("generateCJSInitBanner", () => {
    it("includes worker_threads require for main thread check", () => {
      const banner = generateCJSInitBanner();

      expect(banner).toContain(
        'const { isMainThread: __isMainThread } = require("node:worker_threads")',
      );
    });

    it("includes node:module require", () => {
      const banner = generateCJSInitBanner();

      expect(banner).toContain('const __Module = require("node:module")');
    });

    it("includes pathToFileURL for base URL", () => {
      const banner = generateCJSInitBanner();

      expect(banner).toContain(
        'const { pathToFileURL: __pathToFileURL } = require("node:url")',
      );
      expect(banner).toContain("const __baseUrl = __pathToFileURL(__filename)");
    });

    it("includes IITM exclusion patterns", () => {
      const banner = generateCJSInitBanner();

      expect(banner).toContain("__iitmExclusions");
      expect(banner).toContain("/langsmith/");
    });

    it("includes dd-trace initialization code", () => {
      const banner = generateCJSInitBanner();

      expect(banner).toContain('require("dd-trace")');
      expect(banner).toContain("__tracer.init()");
      expect(banner).toContain("new __tracer.TracerProvider()");
    });

    it("includes ESM loader hook registration", () => {
      const banner = generateCJSInitBanner();

      expect(banner).toContain("__Module.register");
      expect(banner).toContain("dd-trace/loader-hook.mjs");
    });
  });
});
