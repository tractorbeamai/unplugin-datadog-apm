/**
 * ESM proxy generation for import-in-the-middle integration.
 *
 * Generates ESM proxy modules that register with import-in-the-middle,
 * allowing dd-trace to intercept and instrument ESM imports.
 *
 * @module
 */

import { pathToFileURL } from "node:url";

import { parse, type Node } from "acorn";

/**
 * Extract names from a binding pattern (handles destructuring).
 * Supports Identifier, ObjectPattern, ArrayPattern, RestElement, and AssignmentPattern.
 */
function extractPatternNames(pattern: Node, names: string[]): void {
  switch (pattern.type) {
    case "Identifier": {
      names.push((pattern as Node & { name: string }).name);
      break;
    }
    case "ObjectPattern": {
      const objectPattern = pattern as Node & { properties: Node[] };
      for (const prop of objectPattern.properties) {
        if (prop.type === "Property") {
          extractPatternNames((prop as Node & { value: Node }).value, names);
        } else if (prop.type === "RestElement") {
          extractPatternNames(
            (prop as Node & { argument: Node }).argument,
            names,
          );
        }
      }
      break;
    }
    case "ArrayPattern": {
      const arrayPattern = pattern as Node & { elements: (Node | null)[] };
      for (const elem of arrayPattern.elements) {
        if (elem) extractPatternNames(elem, names);
      }
      break;
    }
    case "RestElement": {
      extractPatternNames(
        (pattern as Node & { argument: Node }).argument,
        names,
      );
      break;
    }
    case "AssignmentPattern": {
      extractPatternNames((pattern as Node & { left: Node }).left, names);
      break;
    }
  }
}

/**
 * Extract declared names from export declarations.
 * Handles VariableDeclaration, FunctionDeclaration, and ClassDeclaration.
 */
function extractDeclaredNames(decl: Node, names: string[]): void {
  switch (decl.type) {
    case "VariableDeclaration": {
      const varDecl = decl as Node & { declarations: (Node & { id: Node })[] };
      for (const declarator of varDecl.declarations) {
        extractPatternNames(declarator.id, names);
      }
      break;
    }
    case "FunctionDeclaration":
    case "ClassDeclaration": {
      const namedDecl = decl as Node & { id: Node | null };
      if (namedDecl.id) {
        names.push((namedDecl.id as Node & { name: string }).name);
      }
      break;
    }
  }
}

/**
 * Parse a module to extract its export names using AST parsing.
 * Uses Acorn to properly handle all export patterns including destructuring.
 */
export function parseExportsFromSource(code: string): string[] {
  const exports: string[] = [];
  const starExports: string[] = [];

  let ast: Node & { body: Node[] };
  try {
    ast = parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
    }) as Node & { body: Node[] };
  } catch {
    // If parsing fails, return empty array (caller handles fallback)
    return [];
  }

  for (const node of ast.body) {
    switch (node.type) {
      case "ExportNamedDeclaration": {
        const exportNode = node as Node & {
          specifiers?: (Node & { exported: Node & { name: string } })[];
          declaration?: Node;
        };

        // Handle: export { a, b as c }
        if (exportNode.specifiers) {
          for (const spec of exportNode.specifiers) {
            exports.push(spec.exported.name);
          }
        }

        // Handle: export const/let/var/function/class declarations
        if (exportNode.declaration) {
          extractDeclaredNames(exportNode.declaration, exports);
        }
        break;
      }
      case "ExportDefaultDeclaration": {
        exports.push("default");
        break;
      }
      case "ExportAllDeclaration": {
        // Handle: export * from 'module'
        const exportAllNode = node as Node & {
          source: Node & { value: string };
        };
        starExports.push(`* from ${exportAllNode.source.value}`);
        break;
      }
    }
  }

  return [...new Set([...exports, ...starExports])];
}

/**
 * Generate ESM proxy module code that registers with import-in-the-middle.
 */
export function generateESMProxy(
  originalPath: string,
  rawImportPath: string,
  exportNames: string[],
  isBuiltin: boolean,
): string {
  const moduleUrl = isBuiltin
    ? rawImportPath
    : pathToFileURL(originalPath).href;
  const importPath = isBuiltin ? rawImportPath : originalPath;

  // Filter out star exports for the setter generation
  const namedExports = exportNames.filter((n) => !n.startsWith("* from "));
  const starExports = exportNames
    .filter((n) => n.startsWith("* from "))
    .map((n) => n.slice(7)); // Remove "* from " prefix

  // Generate setter code for each export
  const setterCode = namedExports
    .map((name) => {
      const safeName = `$${name.replaceAll(/[^\w$]/g, "_")}`;
      const key = JSON.stringify(name);
      const exportAs = name === "default" ? "default" : key;

      return `
let ${safeName};
try {
  ${safeName} = _[${key}] = namespace[${key}];
} catch (err) {
  if (!(err instanceof ReferenceError)) throw err;
}
export { ${safeName} as ${exportAs} };
set[${key}] = (v) => { ${safeName} = v; return true; };
get[${key}] = () => ${safeName};`;
    })
    .join("\n");

  // Generate star export re-exports
  const starExportCode = starExports
    .map((mod) => `export * from ${JSON.stringify(mod)};`)
    .join("\n");

  return `
import { register } from 'import-in-the-middle/lib/register.js';
import * as namespace from ${JSON.stringify(importPath)};

const _ = Object.create(null, { [Symbol.toStringTag]: { value: 'Module' } });
const set = {};
const get = {};

${setterCode}
${starExportCode}

register(${JSON.stringify(moduleUrl)}, _, set, get, ${JSON.stringify(rawImportPath)});
`;
}
