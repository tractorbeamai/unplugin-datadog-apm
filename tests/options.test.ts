import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveOptions, type Options } from "../src/core/options";

describe("resolveOptions", () => {
  const originalEnv = process.env.DD_TRACE_DEBUG;

  beforeEach(() => {
    delete process.env.DD_TRACE_DEBUG;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.DD_TRACE_DEBUG;
    } else {
      process.env.DD_TRACE_DEBUG = originalEnv;
    }
  });

  describe("debug option", () => {
    it("defaults to false when DD_TRACE_DEBUG is not set", () => {
      const result = resolveOptions({});
      expect(result.debug).toBe(false);
    });

    it("defaults to true when DD_TRACE_DEBUG is set to truthy value", () => {
      process.env.DD_TRACE_DEBUG = "true";
      const result = resolveOptions({});
      expect(result.debug).toBe(true);
    });

    it("defaults to true when DD_TRACE_DEBUG is any non-empty string", () => {
      process.env.DD_TRACE_DEBUG = "1";
      const result = resolveOptions({});
      expect(result.debug).toBe(true);
    });

    it("explicit true overrides env var", () => {
      delete process.env.DD_TRACE_DEBUG;
      const result = resolveOptions({ debug: true });
      expect(result.debug).toBe(true);
    });

    it("explicit false overrides env var", () => {
      process.env.DD_TRACE_DEBUG = "true";
      const result = resolveOptions({ debug: false });
      expect(result.debug).toBe(false);
    });
  });

  describe("additionalModules option", () => {
    it("defaults to empty array", () => {
      const result = resolveOptions({});
      expect(result.additionalModules).toEqual([]);
    });

    it("uses provided array", () => {
      const modules = ["custom-module", "@scope/pkg"];
      const result = resolveOptions({ additionalModules: modules });
      expect(result.additionalModules).toEqual(modules);
    });

    it("preserves empty array when explicitly provided", () => {
      const result = resolveOptions({ additionalModules: [] });
      expect(result.additionalModules).toEqual([]);
    });
  });

  describe("excludeModules option", () => {
    it("defaults to empty array", () => {
      const result = resolveOptions({});
      expect(result.excludeModules).toEqual([]);
    });

    it("uses provided array", () => {
      const modules = ["pino", "ioredis"];
      const result = resolveOptions({ excludeModules: modules });
      expect(result.excludeModules).toEqual(modules);
    });

    it("preserves empty array when explicitly provided", () => {
      const result = resolveOptions({ excludeModules: [] });
      expect(result.excludeModules).toEqual([]);
    });
  });

  describe("combined options", () => {
    it("resolves all options together", () => {
      const options: Options = {
        debug: true,
        additionalModules: ["custom"],
        excludeModules: ["pino"],
      };
      const result = resolveOptions(options);

      expect(result).toEqual({
        debug: true,
        additionalModules: ["custom"],
        excludeModules: ["pino"],
      });
    });

    it("resolves partial options with defaults", () => {
      const result = resolveOptions({ debug: true });

      expect(result).toEqual({
        debug: true,
        additionalModules: [],
        excludeModules: [],
      });
    });
  });
});
