/**
 * Convert CJS wrapper code to ESM-compatible dynamic imports.
 *
 * The conversion keeps the wrapper behavior while turning dc-polyfill
 * into a dynamic import that works in ESM output.
 */
import { parse, type Node } from "acorn";
import { walk } from "estree-walker";
import MagicString from "magic-string";

import {
  isIdentifier,
  isModuleExportsMemberExpression,
  isStringLiteral,
  type MemberExpressionNode,
} from "./ast-utils";

type CallExpressionNode = Node & {
  callee: Node;
  arguments: Node[];
  start: number;
  end: number;
};
type FunctionExpressionNode = Node & {
  id: Node | null;
  body: Node & { body: Node[]; start: number };
  start: number;
  end: number;
};

/**
 * Check if a node refers to payload.module.
 *
 * @param node - AST node to check.
 * @returns True when the node is payload.module.
 */
function isPayloadModuleMemberExpression(node: Node): boolean {
  if (node.type !== "MemberExpression") return false;
  const member = node as MemberExpressionNode;
  return (
    isIdentifier(member.object, "payload") &&
    isIdentifier(member.property, "module")
  );
}

/**
 * Check for require('specifier') call expressions.
 *
 * @param node - AST node to check.
 * @param specifier - Required module specifier.
 * @returns True when the node matches the require call.
 */
function isRequireCall(node: Node, specifier: string): boolean {
  if (node.type !== "CallExpression") return false;
  const call = node as CallExpressionNode;
  return (
    isIdentifier(call.callee, "require") &&
    call.arguments.length === 1 &&
    isStringLiteral(call.arguments[0], specifier)
  );
}

/**
 * Detect a typeof module !== 'undefined' guard.
 *
 * @param node - AST node to check.
 * @returns True when the node matches the typeof guard.
 */
function isTypeofModuleCheck(node: Node): boolean {
  if (node.type !== "BinaryExpression") return false;
  const test = node as Node & { operator: string; left: Node; right: Node };
  if (test.operator !== "!==") return false;
  if (test.left.type !== "UnaryExpression") return false;
  const unary = test.left as Node & { operator: string; argument: Node };
  if (unary.operator !== "typeof") return false;
  return (
    isIdentifier(unary.argument, "module") &&
    isStringLiteral(test.right, "undefined")
  );
}

/**
 * Detect module.exports = payload.module assignments.
 *
 * @param node - AST node to check.
 * @returns True when the node is the matching assignment.
 */
function isModuleExportsPayloadAssignment(node: Node): boolean {
  if (node.type !== "AssignmentExpression") return false;
  const assignment = node as Node & {
    operator: string;
    left: Node;
    right: Node;
  };
  return (
    assignment.operator === "=" &&
    isModuleExportsMemberExpression(assignment.left) &&
    isPayloadModuleMemberExpression(assignment.right)
  );
}

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
 * Find the wrapper's conditional module.exports reassignment.
 *
 * This identifies the cleanup assignment that is removed during conversion.
 *
 * @param root - Root AST node to search.
 * @param walkNode - Walker for traversing the AST.
 * @returns Matching node or null when not found.
 */
function findModuleExportsReassign(
  root: Node,
  walkNode: (node: Node, visitors: { enter: (node: Node) => void }) => void,
): Node | null {
  let found: Node | null = null;

  walkNode(root, {
    enter(node: Node) {
      if (found) return;
      if (node.type !== "IfStatement") return;
      const ifStmt = node as Node & {
        test: Node;
        consequent: Node;
      };
      if (!isTypeofModuleCheck(ifStmt.test)) return;
      if (ifStmt.consequent.type === "ExpressionStatement") {
        const expr = ifStmt.consequent as Node & { expression: Node };
        if (isModuleExportsPayloadAssignment(expr.expression)) {
          found = node;
        }
        return;
      }
      if (ifStmt.consequent.type === "BlockStatement") {
        const block = ifStmt.consequent as Node & { body: Node[] };
        if (
          block.body.length === 1 &&
          block.body[0]?.type === "ExpressionStatement"
        ) {
          const expr = block.body[0] as Node & { expression: Node };
          if (isModuleExportsPayloadAssignment(expr.expression)) {
            found = node;
          }
        }
      }
    },
  });

  return found;
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
  let ast: Node & { body: Node[] };
  try {
    ast = parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
    }) as Node & { body: Node[] };
  } catch {
    // If we can't parse, we can't safely rewrite.
    return null;
  }

  const s = new MagicString(code);
  const walkNode = walk as unknown as (
    node: Node,
    visitors: { enter: (node: Node) => void },
  ) => void;

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
