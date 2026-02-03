/**
 * Convert CJS wrapper code to ESM-compatible dynamic imports.
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

function isPayloadModuleMemberExpression(node: Node): boolean {
  if (node.type !== "MemberExpression") return false;
  const member = node as MemberExpressionNode;
  return (
    isIdentifier(member.object, "payload") &&
    isIdentifier(member.property, "module")
  );
}

function isRequireCall(node: Node, specifier: string): boolean {
  if (node.type !== "CallExpression") return false;
  const call = node as CallExpressionNode;
  return (
    isIdentifier(call.callee, "require") &&
    call.arguments.length === 1 &&
    isStringLiteral(call.arguments[0], specifier)
  );
}

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

function findStatement(
  body: Node[],
  predicate: (node: Node) => boolean,
): Node | null {
  for (const stmt of body) {
    if (predicate(stmt)) return stmt;
  }
  return null;
}

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

export function convertCJSWrapperToESM(code: string): string | null {
  if (!code.includes("dc-polyfill")) return null;
  let ast: Node & { body: Node[] };
  try {
    ast = parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
    }) as Node & { body: Node[] };
  } catch {
    return null;
  }

  const s = new MagicString(code);
  const walkNode = walk as unknown as (
    node: Node,
    visitors: { enter: (node: Node) => void },
  ) => void;

  walkNode(ast, {
    enter(node: Node) {
      if (node.type !== "CallExpression") return;
      const call = node as CallExpressionNode;
      if (call.arguments.length > 0) return;
      if (call.callee.type !== "FunctionExpression") return;
      const func = call.callee as FunctionExpressionNode;
      if (func.id) return;

      const bodyStatements = func.body.body;
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

      const reassign = findModuleExportsReassign(func.body, walkNode);

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
