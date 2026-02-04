import { describe, expect, it } from "vitest";

import { isEsmFormat } from "../../src/core/format";

describe("format", () => {
  describe("isEsmFormat", () => {
    it('returns true for "es"', () => {
      expect(isEsmFormat("es")).toBe(true);
    });

    it('returns true for "esm"', () => {
      expect(isEsmFormat("esm")).toBe(true);
    });

    it('returns true for "module"', () => {
      expect(isEsmFormat("module")).toBe(true);
    });

    it('returns false for "cjs"', () => {
      expect(isEsmFormat("cjs")).toBe(false);
    });

    it('returns false for "commonjs"', () => {
      expect(isEsmFormat("commonjs")).toBe(false);
    });

    it('returns false for "iife"', () => {
      expect(isEsmFormat("iife")).toBe(false);
    });

    it('returns false for "umd"', () => {
      expect(isEsmFormat("umd")).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isEsmFormat()).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isEsmFormat("")).toBe(false);
    });
  });
});
