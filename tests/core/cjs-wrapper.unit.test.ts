/**
 * Unit tests for CommonJS module wrapper generation.
 * Tests the wrapCommonJSModule function directly.
 */
import { describe, expect, it } from "vitest";

import { wrapCommonJSModule } from "../../src/core/cjs-wrapper";
import { CHANNEL } from "../../src/core/constants";

describe("wrapCommonJSModule", () => {
  describe("wrapper structure", () => {
    it("preserves original code logic while intercepting exports", () => {
      const originalCode = "const foo = 1;\nmodule.exports = { foo };";
      const wrapped = wrapCommonJSModule(originalCode, {
        pkg: "test-pkg",
        path: "",
        version: "1.0.0",
      });

      // Original logic is preserved, but module.exports assignments are intercepted
      expect(wrapped).toContain("const foo = 1;");
      expect(wrapped).toContain("__dd_mod__ = module.exports = { foo };");
    });

    it("appends IIFE wrapper after original code", () => {
      const wrapped = wrapCommonJSModule("module.exports = {};", {
        pkg: "test-pkg",
        path: "",
        version: "1.0.0",
      });

      expect(wrapped).toContain(";(function() {");
      expect(wrapped).toContain("})();");
    });

    it("declares __dd_mod__ variable at top", () => {
      const wrapped = wrapCommonJSModule("module.exports = {};", {
        pkg: "test",
        path: "",
        version: "1.0.0",
      });

      expect(wrapped.startsWith("var __dd_mod__;")).toBe(true);
    });
  });

  describe("assignment interception", () => {
    it('captures module["exports"] assignments', () => {
      const wrapped = wrapCommonJSModule('module["exports"] = { foo: 1 };', {
        pkg: "test",
        path: "",
        version: "1.0.0",
      });

      expect(wrapped).toContain('__dd_mod__ = module["exports"] = { foo: 1 };');
    });

    it("captures multiple module.exports assignments", () => {
      const wrapped = wrapCommonJSModule(
        "module.exports = { a: 1 };\nmodule.exports = { b: 2 };",
        {
          pkg: "test",
          path: "",
          version: "1.0.0",
        },
      );

      expect(wrapped.match(/__dd_mod__ = module\.exports =/g)?.length).toBe(2);
    });
  });

  describe("dc-polyfill integration", () => {
    it("requires dc-polyfill", () => {
      const wrapped = wrapCommonJSModule("", {
        pkg: "test",
        path: "",
        version: "1.0.0",
      });

      expect(wrapped).toContain("require('dc-polyfill')");
    });

    it("creates channel with correct name", () => {
      const wrapped = wrapCommonJSModule("", {
        pkg: "test",
        path: "",
        version: "1.0.0",
      });

      expect(wrapped).toContain(`dc.channel('${CHANNEL}')`);
    });
  });

  describe("payload structure", () => {
    it("includes module reference using captured exports", () => {
      const wrapped = wrapCommonJSModule("", {
        pkg: "test",
        path: "",
        version: "1.0.0",
      });

      // Uses __dd_mod__ (captured) with fallback to module.exports
      expect(wrapped).toContain(
        "var mod = typeof __dd_mod__ !== 'undefined' ? __dd_mod__",
      );
      expect(wrapped).toContain("module: mod");
    });

    it("includes version", () => {
      const wrapped = wrapCommonJSModule("", {
        pkg: "test",
        path: "",
        version: "2.5.3",
      });

      expect(wrapped).toMatch(/version:\s*["']2\.5\.3["']/);
    });

    it("includes package name", () => {
      const wrapped = wrapCommonJSModule("", {
        pkg: "my-package",
        path: "",
        version: "1.0.0",
      });

      expect(wrapped).toMatch(/package:\s*["']my-package["']/);
    });

    it("includes path for root import", () => {
      const wrapped = wrapCommonJSModule("", {
        pkg: "lodash",
        path: "",
        version: "4.17.21",
      });

      expect(wrapped).toMatch(/path:\s*["']lodash["']/);
    });

    it("includes full path for submodule import", () => {
      const wrapped = wrapCommonJSModule("", {
        pkg: "lodash",
        path: "get",
        version: "4.17.21",
      });

      expect(wrapped).toMatch(/path:\s*["']lodash\/get["']/);
    });

    it("handles deep submodule paths", () => {
      const wrapped = wrapCommonJSModule("", {
        pkg: "lodash",
        path: "fp/get",
        version: "4.17.21",
      });

      expect(wrapped).toMatch(/path:\s*["']lodash\/fp\/get["']/);
    });
  });

  describe("scoped packages", () => {
    it("handles scoped package names", () => {
      const wrapped = wrapCommonJSModule("", {
        pkg: "@aws-sdk/client-s3",
        path: "",
        version: "3.500.0",
      });

      expect(wrapped).toMatch(/package:\s*["']@aws-sdk\/client-s3["']/);
      expect(wrapped).toMatch(/path:\s*["']@aws-sdk\/client-s3["']/);
    });

    it("handles scoped package with subpath", () => {
      const wrapped = wrapCommonJSModule("", {
        pkg: "@aws-sdk/client-s3",
        path: "commands/GetObjectCommand",
        version: "3.500.0",
      });

      expect(wrapped).toMatch(
        /path:\s*["']@aws-sdk\/client-s3\/commands\/GetObjectCommand["']/,
      );
    });
  });

  describe("channel publishing", () => {
    it("publishes payload to channel", () => {
      const wrapped = wrapCommonJSModule("", {
        pkg: "test",
        path: "",
        version: "1.0.0",
      });

      expect(wrapped).toContain("ch.publish(payload)");
    });

    it("conditionally reassigns module.exports from payload", () => {
      const wrapped = wrapCommonJSModule("", {
        pkg: "test",
        path: "",
        version: "1.0.0",
      });

      // Conditional to handle ESM context where module may not exist
      expect(wrapped).toContain(
        "if (typeof module !== 'undefined') module.exports = payload.module",
      );
    });
  });

  describe("code ordering", () => {
    it("executes original code before wrapper", () => {
      const wrapped = wrapCommonJSModule("module.exports = { test: true };", {
        pkg: "test",
        path: "",
        version: "1.0.0",
      });

      // module.exports assignment comes before IIFE wrapper
      const exportAssignment = wrapped.indexOf("__dd_mod__ = module.exports =");
      const wrapperStart = wrapped.indexOf(";(function()");

      expect(exportAssignment).toBeLessThan(wrapperStart);
    });

    it("uses captured exports in wrapper IIFE", () => {
      const wrapped = wrapCommonJSModule("", {
        pkg: "test",
        path: "",
        version: "1.0.0",
      });

      const wrapperStart = wrapped.indexOf(";(function()");
      const modCapture = wrapped.indexOf("var mod = typeof __dd_mod__");

      expect(wrapperStart).toBeLessThan(modCapture);
    });
  });

  describe("special characters in values", () => {
    it("handles package names with hyphens", () => {
      const wrapped = wrapCommonJSModule("", {
        pkg: "my-cool-package",
        path: "",
        version: "1.0.0",
      });

      expect(wrapped).toMatch(/package:\s*["']my-cool-package["']/);
    });

    it("handles version strings with pre-release tags", () => {
      const wrapped = wrapCommonJSModule("", {
        pkg: "test",
        path: "",
        version: "1.0.0-beta.1",
      });

      expect(wrapped).toMatch(/version:\s*["']1\.0\.0-beta\.1["']/);
    });
  });
});
