import { describe, expect, it, vi } from "vitest";

import {
  appendExternals,
  getStringExternals,
  matchesExternal,
  mergeExternals,
} from "../../src/core/externals";

describe("externals", () => {
  describe("matchesExternal", () => {
    it("matches by exact string", () => {
      expect(matchesExternal("dd-trace", ["dd-trace"])).toBe(true);
      expect(matchesExternal("dd-trace/", ["dd-trace"])).toBe(false);
    });

    it("matches by regex", () => {
      expect(matchesExternal("dd-trace/init", [/^dd-trace\//])).toBe(true);
      expect(matchesExternal("dd-trace", [/^dd-trace\//])).toBe(false);
    });
  });

  describe("mergeExternals (rollup-style)", () => {
    it("appends required externals to an array, de-duped", () => {
      const existing = ["dd-trace", /^import-in-the-middle\//] as const;
      const merged = mergeExternals(existing, [
        "dd-trace",
        /^import-in-the-middle\//,
        "dc-polyfill",
      ]);

      expect(Array.isArray(merged)).toBe(true);
      expect(merged).toEqual([
        "dd-trace",
        /^import-in-the-middle\//,
        "dc-polyfill",
      ]);
    });

    it("wraps an existing function so required externals always match", () => {
      const existing = vi.fn(() => false);
      const merged = mergeExternals(existing, ["dd-trace", /^dd-trace\//]);

      expect(typeof merged).toBe("function");
      if (typeof merged !== "function") {
        throw new TypeError("Expected mergeExternals() to return a function");
      }

      expect(merged("dd-trace")).toBe(true);
      expect(merged("dd-trace/init")).toBe(true);
      expect(existing).not.toHaveBeenCalled();

      expect(merged("some-other")).toBe(false);
      expect(existing).toHaveBeenCalledTimes(1);
    });
  });

  describe("appendExternals (webpack-style)", () => {
    it("returns required externals when existing is empty", () => {
      expect(appendExternals(undefined, ["dd-trace"])).toEqual(["dd-trace"]);
    });

    it("appends required externals to an existing array, de-duped", () => {
      const existing = ["dd-trace"] as const;
      const result = appendExternals(existing, ["dd-trace", "dc-polyfill"]);
      expect(result).toEqual(["dd-trace", "dc-polyfill"]);
    });

    it("keeps existing function/object entries and de-dupes required strings/regex", () => {
      const fn = vi.fn();
      const obj = { foo: "bar" };

      const result = appendExternals(
        [fn, obj, "dd-trace"],
        ["dd-trace", /^dd-trace\//, /^dd-trace\//],
      );

      expect(result).toEqual([fn, obj, "dd-trace", /^dd-trace\//]);
    });
  });

  describe("getStringExternals", () => {
    it("filters to strings only", () => {
      expect(getStringExternals(["dd-trace", /^dd-trace\//])).toEqual([
        "dd-trace",
      ]);
    });
  });
});
