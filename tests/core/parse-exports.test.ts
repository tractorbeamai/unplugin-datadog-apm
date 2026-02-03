/**
 * Unit tests for parseExportsFromSource function.
 * Tests AST-based export parsing for various JavaScript/ESM patterns.
 */
import { describe, expect, it } from "vitest";

import { parseExportsFromSource } from "../../src/core/esm-proxy";

describe("parseExportsFromSource", () => {
  describe("named exports", () => {
    it("parses export const declarations", () => {
      const code = "export const foo = 1;";
      expect(parseExportsFromSource(code)).toContain("foo");
    });

    it("parses export let declarations", () => {
      const code = "export let bar = 2;";
      expect(parseExportsFromSource(code)).toContain("bar");
    });

    it("parses export var declarations", () => {
      const code = "export var baz = 3;";
      expect(parseExportsFromSource(code)).toContain("baz");
    });

    it("parses multiple variables in single declaration", () => {
      const code = "export const a = 1, b = 2, c = 3;";
      const exports = parseExportsFromSource(code);

      expect(exports).toContain("a");
      expect(exports).toContain("b");
      expect(exports).toContain("c");
    });
  });

  describe("function exports", () => {
    it("parses export function declarations", () => {
      const code = "export function myFunc() {}";
      expect(parseExportsFromSource(code)).toContain("myFunc");
    });

    it("parses export async function declarations", () => {
      const code = "export async function asyncFunc() {}";
      expect(parseExportsFromSource(code)).toContain("asyncFunc");
    });

    it("parses export generator function declarations", () => {
      const code = "export function* genFunc() {}";
      expect(parseExportsFromSource(code)).toContain("genFunc");
    });

    it("parses export async generator function declarations", () => {
      const code = "export async function* asyncGenFunc() {}";
      expect(parseExportsFromSource(code)).toContain("asyncGenFunc");
    });
  });

  describe("class exports", () => {
    it("parses export class declarations", () => {
      const code = "export class MyClass {}";
      expect(parseExportsFromSource(code)).toContain("MyClass");
    });
  });

  describe("export specifiers", () => {
    it("parses export { name } syntax", () => {
      const code = "const foo = 1; export { foo };";
      expect(parseExportsFromSource(code)).toContain("foo");
    });

    it("parses export { a, b, c } syntax", () => {
      const code = "const a = 1, b = 2, c = 3; export { a, b, c };";
      const exports = parseExportsFromSource(code);

      expect(exports).toContain("a");
      expect(exports).toContain("b");
      expect(exports).toContain("c");
    });

    it("parses aliased exports: export { foo as bar }", () => {
      const code = "const foo = 1; export { foo as bar };";
      const exports = parseExportsFromSource(code);

      expect(exports).toContain("bar");
      expect(exports).not.toContain("foo");
    });

    it("parses mixed aliased and non-aliased exports", () => {
      const code = "const a = 1, b = 2; export { a, b as c };";
      const exports = parseExportsFromSource(code);

      expect(exports).toContain("a");
      expect(exports).toContain("c");
      expect(exports).not.toContain("b");
    });
  });

  describe("default exports", () => {
    it("parses export default function", () => {
      const code = "export default function() {}";
      expect(parseExportsFromSource(code)).toContain("default");
    });

    it("parses export default class", () => {
      const code = "export default class {}";
      expect(parseExportsFromSource(code)).toContain("default");
    });

    it("parses export default expression", () => {
      const code = "export default { foo: 1 };";
      expect(parseExportsFromSource(code)).toContain("default");
    });

    it("parses export default identifier", () => {
      const code = "const foo = 1; export default foo;";
      expect(parseExportsFromSource(code)).toContain("default");
    });

    it("parses export { foo as default }", () => {
      const code = "const foo = 1; export { foo as default };";
      expect(parseExportsFromSource(code)).toContain("default");
    });
  });

  describe("re-exports", () => {
    it("parses export * from", () => {
      const code = "export * from './utils.js';";
      const exports = parseExportsFromSource(code);

      expect(exports).toContain("* from ./utils.js");
    });

    it("parses multiple star exports", () => {
      const code = `
        export * from './a.js';
        export * from './b.js';
      `;
      const exports = parseExportsFromSource(code);

      expect(exports).toContain("* from ./a.js");
      expect(exports).toContain("* from ./b.js");
    });

    it("parses export { name } from", () => {
      const code = "export { foo } from './utils.js';";
      expect(parseExportsFromSource(code)).toContain("foo");
    });

    it("parses export { name as alias } from", () => {
      const code = "export { foo as bar } from './utils.js';";
      const exports = parseExportsFromSource(code);

      expect(exports).toContain("bar");
      expect(exports).not.toContain("foo");
    });
  });

  describe("destructuring exports", () => {
    it("parses object destructuring exports", () => {
      const code = "const obj = { a: 1, b: 2 }; export const { a, b } = obj;";
      const exports = parseExportsFromSource(code);

      expect(exports).toContain("a");
      expect(exports).toContain("b");
    });

    it("parses array destructuring exports", () => {
      const code = "const arr = [1, 2]; export const [first, second] = arr;";
      const exports = parseExportsFromSource(code);

      expect(exports).toContain("first");
      expect(exports).toContain("second");
    });

    it("parses nested destructuring exports", () => {
      const code =
        "const obj = { a: { b: 1 } }; export const { a: { b } } = obj;";
      const exports = parseExportsFromSource(code);

      expect(exports).toContain("b");
      expect(exports).not.toContain("a");
    });

    it("parses destructuring with rest element", () => {
      const code =
        "const obj = { a: 1, b: 2 }; export const { a, ...rest } = obj;";
      const exports = parseExportsFromSource(code);

      expect(exports).toContain("a");
      expect(exports).toContain("rest");
    });

    it("parses destructuring with default values", () => {
      const code = "const obj = {}; export const { a = 1 } = obj;";
      expect(parseExportsFromSource(code)).toContain("a");
    });
  });

  describe("complex modules", () => {
    it("parses module with multiple export types", () => {
      const code = `
        export const a = 1;
        export function b() {}
        export class C {}
        const d = 4;
        export { d };
        export default { e: 5 };
        export * from './utils.js';
      `;
      const exports = parseExportsFromSource(code);

      expect(exports).toContain("a");
      expect(exports).toContain("b");
      expect(exports).toContain("C");
      expect(exports).toContain("d");
      expect(exports).toContain("default");
      expect(exports).toContain("* from ./utils.js");
    });

    it("returns unique exports (no duplicates in output)", () => {
      // Note: The code `export const foo = 1; export { foo };` would be a
      // JavaScript syntax error (duplicate export), so we test that the Set
      // deduplication works for star exports that could overlap
      const code = `
        export * from './a.js';
        export * from './a.js';
      `;
      const exports = parseExportsFromSource(code);
      const starCount = exports.filter((e) => e === "* from ./a.js").length;

      expect(starCount).toBe(1);
    });
  });

  describe("error handling", () => {
    it("returns empty array for invalid JavaScript", () => {
      const code = "this is not valid { javascript";
      expect(parseExportsFromSource(code)).toEqual([]);
    });

    it("returns empty array for empty string", () => {
      expect(parseExportsFromSource("")).toEqual([]);
    });

    it("returns empty array for module with no exports", () => {
      const code = "const foo = 1; console.log(foo);";
      expect(parseExportsFromSource(code)).toEqual([]);
    });
  });
});
