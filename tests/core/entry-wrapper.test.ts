/**
 * Unit tests for entry wrapper generation.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { INIT_MODULE } from "../../src/core/constants";
import { generateEntryWrapper } from "../../src/core/entry-wrapper";

describe("generateEntryWrapper", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "entry-wrapper-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createFile(filename: string, content: string): string {
    const filePath = path.join(tempDir, filename);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
    return filePath;
  }

  describe("basic structure", () => {
    it("includes init module import", () => {
      const filePath = createFile("index.js", "export const foo = 1;");
      const wrapper = generateEntryWrapper(filePath);

      expect(wrapper).toContain(`import ${JSON.stringify(INIT_MODULE)}`);
    });

    it("includes comment about auto-generation", () => {
      const filePath = createFile("index.js", "export const foo = 1;");
      const wrapper = generateEntryWrapper(filePath);

      expect(wrapper).toContain("Auto-generated entry wrapper");
      expect(wrapper).toContain("unplugin-datadog-apm");
    });

    it("re-exports everything from original module", () => {
      const filePath = createFile("index.js", "export const foo = 1;");
      const wrapper = generateEntryWrapper(filePath);

      expect(wrapper).toContain(`export * from ${JSON.stringify(filePath)}`);
    });
  });

  describe("default export handling", () => {
    it("re-exports default when module has default export", () => {
      const filePath = createFile(
        "index.js",
        "export default function main() {}",
      );
      const wrapper = generateEntryWrapper(filePath);

      expect(wrapper).toContain(
        `export { default } from ${JSON.stringify(filePath)}`,
      );
    });

    it("re-exports default for export default class", () => {
      const filePath = createFile("index.js", "export default class App {}");
      const wrapper = generateEntryWrapper(filePath);

      expect(wrapper).toContain("export { default }");
    });

    it("re-exports default for export default expression", () => {
      const filePath = createFile("index.js", "export default { foo: 1 };");
      const wrapper = generateEntryWrapper(filePath);

      expect(wrapper).toContain("export { default }");
    });

    it("does not re-export default when module has no default", () => {
      const filePath = createFile("index.js", "export const foo = 1;");
      const wrapper = generateEntryWrapper(filePath);

      expect(wrapper).not.toContain("export { default }");
    });

    it("handles named export aliased as default", () => {
      const filePath = createFile(
        "index.js",
        "const foo = 1; export { foo as default };",
      );
      const wrapper = generateEntryWrapper(filePath);

      expect(wrapper).toContain("export { default }");
    });
  });

  describe("mixed exports", () => {
    it("handles both named and default exports", () => {
      const filePath = createFile(
        "index.js",
        `
        export const a = 1;
        export const b = 2;
        export default function main() {}
      `,
      );
      const wrapper = generateEntryWrapper(filePath);

      expect(wrapper).toContain("export *");
      expect(wrapper).toContain("export { default }");
    });

    it("handles re-exports with default", () => {
      const filePath = createFile(
        "index.js",
        `
        export * from './utils.js';
        export default class App {}
      `,
      );
      const wrapper = generateEntryWrapper(filePath);

      expect(wrapper).toContain("export *");
      expect(wrapper).toContain("export { default }");
    });
  });

  describe("error handling", () => {
    it("gracefully handles non-existent files", () => {
      const nonExistent = path.join(tempDir, "does-not-exist.js");
      const wrapper = generateEntryWrapper(nonExistent);

      // Should still generate wrapper with export *, just no default export
      expect(wrapper).toContain("export *");
      expect(wrapper).toContain(INIT_MODULE);
      expect(wrapper).not.toContain("export { default }");
    });

    it("gracefully handles unparseable files", () => {
      const filePath = createFile(
        "broken.js",
        "this is not { valid javascript",
      );
      const wrapper = generateEntryWrapper(filePath);

      // Should still generate wrapper
      expect(wrapper).toContain("export *");
      expect(wrapper).toContain(INIT_MODULE);
    });
  });

  describe("import order", () => {
    it("imports init module before re-exporting original", () => {
      const filePath = createFile(
        "index.js",
        "export default function main() {}",
      );
      const wrapper = generateEntryWrapper(filePath);
      const lines = wrapper.split("\n").filter((l) => l.trim());

      const initImportIndex = lines.findIndex((l) => l.includes(INIT_MODULE));
      const reExportIndex = lines.findIndex((l) => l.includes("export *"));

      expect(initImportIndex).toBeLessThan(reExportIndex);
    });
  });
});
