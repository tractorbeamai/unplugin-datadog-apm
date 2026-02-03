import { describe, expect, it } from "vitest";

import { wrapCommonJSModule } from "../../src/core/cjs-wrapper";
import { convertCJSWrapperToESM } from "../../src/core/convert-cjs-wrapper";

describe("convertCJSWrapperToESM", () => {
  it("rewrites the wrapper to use dynamic import", () => {
    const wrapped = wrapCommonJSModule("module.exports = { ok: true };", {
      pkg: "test-pkg",
      path: "",
      version: "1.0.0",
    });

    const converted = convertCJSWrapperToESM(wrapped);
    expect(converted).not.toBeNull();
    expect(converted).toContain("import('dc-polyfill').then(");
    expect(converted).toContain("function(dc)");
    expect(converted).not.toContain("require('dc-polyfill')");
    expect(converted).not.toContain("module.exports = payload.module");
  });

  it("returns null when no wrapper is present", () => {
    const converted = convertCJSWrapperToESM("const x = 1;");
    expect(converted).toBeNull();
  });
});
