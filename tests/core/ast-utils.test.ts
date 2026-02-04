import { parse, type Node } from "acorn";
import { describe, expect, it } from "vitest";

import {
  isIdentifier,
  isModuleExportsMemberExpression,
  isStringLiteral,
} from "../../src/core/ast-utils";

describe("ast-utils", () => {
  describe("isIdentifier", () => {
    it("matches an identifier with the expected name", () => {
      const ast = parse("module.exports = 1;", {
        ecmaVersion: "latest",
        sourceType: "script",
      });
      const expression = (ast.body[0] as { expression: { left: Node } })
        .expression;
      expect(isIdentifier(expression.left, "module")).toBe(false);
      expect(isIdentifier(expression as unknown as Node, "module")).toBe(false);
      expect(
        isIdentifier(
          { type: "Identifier", name: "module" } as unknown as Node,
          "module",
        ),
      ).toBe(true);
    });
  });

  describe("isStringLiteral", () => {
    it("matches a literal node with a string value", () => {
      expect(
        isStringLiteral(
          { type: "Literal", value: "exports" } as unknown as Node,
          "exports",
        ),
      ).toBe(true);
      expect(
        isStringLiteral(
          { type: "Literal", value: "other" } as unknown as Node,
          "exports",
        ),
      ).toBe(false);
    });
  });

  describe("isModuleExportsMemberExpression", () => {
    it("matches a non-computed module.exports expression", () => {
      const ast = parse("module.exports = 1;", {
        ecmaVersion: "latest",
        sourceType: "script",
      });
      const expression = (ast.body[0] as { expression: { left: Node } })
        .expression;
      expect(isModuleExportsMemberExpression(expression.left)).toBe(true);
    });

    it("matches a computed module['exports'] expression", () => {
      const ast = parse("module['exports'] = 1;", {
        ecmaVersion: "latest",
        sourceType: "script",
      });
      const expression = (ast.body[0] as { expression: { left: Node } })
        .expression;
      expect(isModuleExportsMemberExpression(expression.left)).toBe(true);
    });

    it("returns false for non-matching expressions", () => {
      const ast = parse("exports.module = 1;", {
        ecmaVersion: "latest",
        sourceType: "script",
      });
      const expression = (ast.body[0] as { expression: { left: Node } })
        .expression;
      expect(isModuleExportsMemberExpression(expression.left)).toBe(false);
    });
  });
});
