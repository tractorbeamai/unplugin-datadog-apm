import { parse, type Node } from "acorn";

export type IdentifierNode = Node & { name: string };
export type LiteralNode = Node & { value: unknown };
export type MemberExpressionNode = Node & {
  object: Node;
  property: Node;
  computed: boolean;
  start: number;
};
export type CallExpressionNode = Node & {
  callee: Node;
  arguments: Node[];
  start: number;
  end: number;
};

/**
 * Walker function type for AST traversal.
 */
export type WalkNode = (
  node: Node,
  visitors: { enter: (node: Node) => void },
) => void;

/**
 * Check whether a node is an Identifier with a specific name.
 *
 * @param node - AST node to check.
 * @param name - Expected identifier name.
 * @returns True when the node is an Identifier with the given name.
 */
export function isIdentifier(node: Node, name: string): node is IdentifierNode {
  return node.type === "Identifier" && (node as IdentifierNode).name === name;
}

/**
 * Check whether a node is a string literal with a specific value.
 *
 * @param node - AST node to check.
 * @param value - Expected string value.
 * @returns True when the node is a Literal with the given value.
 */
export function isStringLiteral(
  node: Node,
  value: string,
): node is LiteralNode {
  return node.type === "Literal" && (node as LiteralNode).value === value;
}

/**
 * Detect `module.exports` member expressions.
 *
 * @param node - AST node to check.
 * @returns True when the node is a module.exports MemberExpression.
 */
export function isModuleExportsMemberExpression(
  node: Node,
): node is MemberExpressionNode {
  if (node.type !== "MemberExpression") return false;
  const member = node as MemberExpressionNode;
  if (!isIdentifier(member.object, "module")) return false;
  if (member.computed) {
    return isStringLiteral(member.property, "exports");
  }
  return isIdentifier(member.property, "exports");
}

/**
 * Check if a node refers to `payload.module`.
 *
 * @param node - AST node to check.
 * @returns True when the node is a payload.module MemberExpression.
 */
export function isPayloadModuleMemberExpression(node: Node): boolean {
  if (node.type !== "MemberExpression") return false;
  const member = node as MemberExpressionNode;
  return (
    isIdentifier(member.object, "payload") &&
    isIdentifier(member.property, "module")
  );
}

/**
 * Check for `require('specifier')` call expressions.
 *
 * @param node - AST node to check.
 * @param specifier - Required module specifier.
 * @returns True when the node is a require call with the given specifier.
 */
export function isRequireCall(node: Node, specifier: string): boolean {
  if (node.type !== "CallExpression") return false;
  const call = node as CallExpressionNode;
  return (
    isIdentifier(call.callee, "require") &&
    call.arguments.length === 1 &&
    isStringLiteral(call.arguments[0], specifier)
  );
}

/**
 * Detect a `typeof module !== 'undefined'` guard.
 *
 * @param node - AST node to check.
 * @returns True when the node is a typeof module !== 'undefined' BinaryExpression.
 */
export function isTypeofModuleCheck(node: Node): boolean {
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
 * Detect `module.exports = payload.module` assignments.
 *
 * @param node - AST node to check.
 * @returns True when the node is a module.exports = payload.module AssignmentExpression.
 */
export function isModuleExportsPayloadAssignment(node: Node): boolean {
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
 * Find the wrapper's conditional `module.exports` reassignment.
 *
 * This identifies the cleanup assignment that is removed during CJS-to-ESM
 * wrapper conversion.
 *
 * @param root - Root AST node to search.
 * @param walkNode - Walker function for traversing the AST.
 * @returns Matching IfStatement node or null when not found.
 */
export function findModuleExportsReassign(
  root: Node,
  walkNode: WalkNode,
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
 * Parse JavaScript source code into an AST.
 *
 * @param code - The source code to parse.
 * @param sourceType - The source type ("script" or "module"). Defaults to "script".
 * @returns The parsed AST or null if parsing fails.
 */
export function parseScript(
  code: string,
  sourceType: "script" | "module" = "script",
): (Node & { body: Node[] }) | null {
  try {
    return parse(code, {
      ecmaVersion: "latest",
      sourceType,
    }) as Node & { body: Node[] };
  } catch {
    return null;
  }
}
