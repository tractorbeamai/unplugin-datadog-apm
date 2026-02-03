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
 *
 * @param pattern - AST node for the binding pattern.
 * @param names - Accumulator for discovered names.
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
 *
 * @param decl - AST node for the export declaration.
 * @param names - Accumulator for discovered names.
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
 * Parse a module and return the export names it declares.
 *
 * @param code - Module source code.
 * @returns Export names plus any `* from` re-export markers.
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
 * Generate ESM proxy code that registers with import-in-the-middle.
 *
 * @param originalPath - Absolute path to the target module.
 * @param rawImportPath - Import specifier as written by the importer.
 * @param exportNames - List of export names to proxy.
 * @param isBuiltin - Whether the module is a Node.js builtin.
 * @returns Proxy module source code.
 */
export function generateESMProxy(
  originalPath: string,
  rawImportPath: string,
  exportNames: string[],
  isBuiltin: boolean,
): string {
  // Builtins are referenced by specifier, not by file URL.
  const moduleUrl = isBuiltin
    ? rawImportPath
    : pathToFileURL(originalPath).href;
  const importPath = isBuiltin ? rawImportPath : originalPath;

  // Split explicit exports from "export *" re-exports so we can
  // treat them differently in the proxy.
  const namedExports = exportNames.filter((n) => !n.startsWith("* from "));
  const starExports = exportNames
    .filter((n) => n.startsWith("* from "))
    .map((n) => n.slice(7)); // Remove "* from " prefix

  // Generate setter/getter wiring so import-in-the-middle can
  // track updates.
  const setterCode = namedExports
    .map((name) => {
      // Convert export names into safe identifiers for local bindings.
      const safeName = `$${name.replaceAll(/[^\w$]/g, "_")}`;
      const key = JSON.stringify(name);
      const exportAs = name === "default" ? "default" : key;

      return `
let ${safeName};
try {
  // Snapshot the original export value into the proxy container.
  ${safeName} = _[${key}] = namespace[${key}];
} catch (err) {
  if (!(err instanceof ReferenceError)) throw err;
}
export { ${safeName} as ${exportAs} };
// Hook into import-in-the-middle's live bindings.
set[${key}] = (v) => { ${safeName} = v; return true; };
get[${key}] = () => ${safeName};`;
    })
    .join("\n");

  // Re-export star exports verbatim so module consumers see them
  // as expected.
  const starExportCode = starExports
    .map((mod) => `export * from ${JSON.stringify(mod)};`)
    .join("\n");

  return `
import { register } from 'import-in-the-middle/lib/register.js';
import * as namespace from ${JSON.stringify(importPath)};

  // _ is the proxy module object that import-in-the-middle will
  // wrap.
const _ = Object.create(null, { [Symbol.toStringTag]: { value: 'Module' } });
const set = {};
const get = {};

${setterCode}
${starExportCode}

register(${JSON.stringify(moduleUrl)}, _, set, get, ${JSON.stringify(rawImportPath)});
`;
}
