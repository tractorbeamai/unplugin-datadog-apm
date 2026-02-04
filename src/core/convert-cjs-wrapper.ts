/**
 * Convert CJS wrapper code to ESM-compatible dynamic imports.
 *
 * The conversion keeps the wrapper behavior while turning dc-polyfill
 * into a dynamic import that works in ESM output.
 */
import type { Node } from "acorn";
import { walk } from "estree-walker";
import MagicString from "magic-string";

import {
  findModuleExportsReassign,
  isIdentifier,
  isRequireCall,
  parseScript,
  type CallExpressionNode,
  type WalkNode,
} from "./ast-utils";

type FunctionExpressionNode = Node & {
  id: Node | null;
  body: Node & { body: Node[]; start: number };
  start: number;
  end: number;
};

/**
 * Find the first statement in a list that matches a predicate.
 *
 * @param body - Statement list to search.
 * @param predicate - Test function for matching.
 * @returns First matching statement or null.
 */
function findStatement(
  body: Node[],
  predicate: (node: Node) => boolean,
): Node | null {
  for (const stmt of body) {
    if (predicate(stmt)) return stmt;
  }
  return null;
}

/**
 * Convert a generated CJS wrapper into an ESM-friendly variant.
 *
 * @param code - Wrapper source code from the CJS transformer.
 * @returns Updated source or null when no conversion is applied.
 * @see https://github.com/DataDog/dd-trace-js/blob/master/packages/datadog-esbuild/index.js
 */
export function convertCJSWrapperToESM(code: string): string | null {
  // Bail early if this isn't a wrapper we recognize.
  if (!code.includes("dc-polyfill")) return null;
  const ast = parseScript(code, "module");
  if (!ast) {
    // If we can't parse, we can't safely rewrite.
    return null;
  }

  const s = new MagicString(code);
  const walkNode = walk as unknown as WalkNode;

  walkNode(ast, {
    enter(node: Node) {
      // We only rewrite the wrapper IIFE with no arguments.
      if (node.type !== "CallExpression") return;
      const call = node as CallExpressionNode;
      if (call.arguments.length > 0) return;
      if (call.callee.type !== "FunctionExpression") return;
      const func = call.callee as FunctionExpressionNode;
      if (func.id) return;

      const bodyStatements = func.body.body;
      // Find the "var dc = require('dc-polyfill')" declaration so we can
      // replace it with a dynamic import.
      const requireDecl = findStatement(bodyStatements, (stmt) => {
        if (stmt.type !== "VariableDeclaration") return false;
        const decl = stmt as Node & {
          declarations: (Node & { id: Node; init: Node | null })[];
        };
        if (decl.declarations.length !== 1) return false;
        const declarator = decl.declarations[0];
        return (
          isIdentifier(declarator.id, "dc") &&
          declarator.init !== null &&
          isRequireCall(declarator.init, "dc-polyfill")
        );
      });

      if (!requireDecl) return;

      // Find the optional module.exports cleanup so we can drop it in ESM.
      const reassign = findModuleExportsReassign(func.body, walkNode);

      // Rewrite the wrapper into an async-ish import callback:
      // import('dc-polyfill').then(function(dc) { ... })
      s.overwrite(func.start, func.body.start, "function(dc) ");
      s.prependLeft(call.start, "import('dc-polyfill').then(");
      s.overwrite(func.end, call.end, "))");
      s.remove(requireDecl.start, requireDecl.end);
      if (reassign) {
        s.remove(reassign.start, reassign.end);
      }
    },
  });

  const transformed = s.toString();
  return transformed === code ? null : transformed;
}
