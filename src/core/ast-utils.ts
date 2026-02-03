import type { Node } from "acorn";

export type IdentifierNode = Node & { name: string };
export type LiteralNode = Node & { value: unknown };
export type MemberExpressionNode = Node & {
  object: Node;
  property: Node;
  computed: boolean;
  start: number;
};

/**
 * Check whether a node is an Identifier with a specific name.
 *
 * @param node - AST node to check.
 * @param name - Expected identifier name.
 */
export function isIdentifier(node: Node, name: string): node is IdentifierNode {
  return node.type === "Identifier" && (node as IdentifierNode).name === name;
}

/**
 * Check whether a node is a string literal with a specific value.
 *
 * @param node - AST node to check.
 * @param value - Expected string value.
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
