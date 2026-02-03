import { describe, expect, it } from "vitest";

import { serializeInitOptions } from "../../src/core/serialize";

describe("serializeInitOptions", () => {
  it("serializes regex literals", () => {
    expect(serializeInitOptions(/foo/)).toBe("/foo/");
  });

  it("serializes functions", () => {
    const sample = function sampleFn(): boolean {
      return true;
    };
    const serialized = serializeInitOptions(sample);
    expect(serialized).toContain("function sampleFn");
    expect(serialized).toContain("return true");
  });

  it("serializes nested values", () => {
    const serialized = serializeInitOptions({
      allowlist: /api/,
      filter: (value: string) => value.startsWith("/"),
    });
    expect(serialized).toContain("allowlist");
    expect(serialized).toContain("/api/");
    expect(serialized).toContain("value.startsWith");
  });
});
