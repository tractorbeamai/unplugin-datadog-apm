/**
 * ESM proxy generation for import-in-the-middle integration.
 *
 * Generates ESM proxy modules that register with import-in-the-middle,
 * allowing dd-trace to intercept and instrument ESM imports.
 *
 * @module
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parse, type Node } from "acorn";

import { isESMFile } from "./dd-trace";
import { BUILTINS, resolveModule } from "./resolve";

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
 * Check if an export entry represents a star re-export.
 *
 * @param name - Export entry string.
 * @returns True when the entry is a `export * from` marker.
 * @see https://github.com/DataDog/dd-trace-js/blob/master/packages/datadog-esbuild/src/utils.js
 */
function isStarExportLine(name: string): boolean {
  return name.startsWith("* from ");
}

/**
 * Determine whether a specifier is a bare module specifier.
 *
 * @param specifier - Import specifier string.
 * @returns True if the specifier is bare (not relative, absolute, or URL).
 * @see https://github.com/DataDog/dd-trace-js/blob/master/packages/datadog-esbuild/src/utils.js
 */
function isBareSpecifier(specifier: string): boolean {
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(URL, "canParse")) {
    return !URL.canParse(specifier);
  }

  try {
    new URL(specifier);
    return false;
  } catch {
    return true;
  }
}

/**
 * Parse the current Node.js major/minor version.
 *
 * @returns Parsed major/minor version numbers.
 * @see https://github.com/DataDog/dd-trace-js/blob/master/packages/datadog-esbuild/src/utils.js
 */
function parseNodeVersion(): { major: number; minor: number } {
  const [major, minor] = process.versions.node.split(".").map(Number);
  return {
    major: Number.isFinite(major) ? major : 0,
    minor: Number.isFinite(minor) ? minor : 0,
  };
}

/**
 * Check if Node runtime supports import-in-the-middle get-exports.
 *
 * @returns True when supported by current Node.js version.
 * @see https://github.com/DataDog/dd-trace-js/blob/master/packages/datadog-esbuild/src/utils.js
 */
function supportsGetExports(): boolean {
  const { major, minor } = parseNodeVersion();
  return major >= 20 || (major === 18 && minor >= 19);
}

/**
 * Lazy-load the import-in-the-middle get-exports module.
 *
 * @returns Module interface for export discovery.
 * @see https://github.com/DataDog/dd-trace-js/blob/master/packages/datadog-esbuild/src/utils.js
 */
async function loadGetExportsModule(): Promise<{
  getExports: (
    url: URL,
    context: { format: "module" | "commonjs" },
    getSource: (
      url: URL,
      context: { format: "module" | "commonjs" },
    ) => { source: string; format: "module" | "commonjs" },
  ) => Promise<string[]>;
}> {
  return (await import("import-in-the-middle/lib/get-exports.mjs")) as {
    getExports: (
      url: URL,
      context: { format: "module" | "commonjs" },
      getSource: (
        url: URL,
        context: { format: "module" | "commonjs" },
      ) => { source: string; format: "module" | "commonjs" },
    ) => Promise<string[]>;
  };
}

/**
 * Read module source for export analysis.
 *
 * @param url - File URL of the module.
 * @param context - Loader context with module format.
 * @returns Source content and format.
 * @see https://github.com/DataDog/dd-trace-js/blob/master/packages/datadog-esbuild/src/utils.js
 */
function getExportSource(
  url: URL,
  context: { format: "module" | "commonjs" },
): { source: string; format: "module" | "commonjs" } {
  return {
    source: readFileSync(fileURLToPath(url), "utf8"),
    format: context.format,
  };
}

/**
 * Resolve export names for a module using get-exports or dynamic import.
 *
 * @param filePath - Absolute path to module file.
 * @param format - Module format (module/commonjs).
 * @returns Export names discovered in the module.
 * @see https://github.com/DataDog/dd-trace-js/blob/master/packages/datadog-esbuild/src/utils.js
 */
async function getExportsFromModule(
  filePath: string,
  format: "module" | "commonjs",
): Promise<string[]> {
  const sourceUrl = pathToFileURL(filePath);

  if (!supportsGetExports()) {
    try {
      const mod = (await import(sourceUrl.href)) as Record<string, unknown>;
      return Object.keys(mod);
    } catch {
      return [];
    }
  }

  try {
    const mod = await loadGetExportsModule();
    return await mod.getExports(sourceUrl, { format }, getExportSource);
  } catch {
    return [];
  }
}

/**
 * Resolve a star export specifier to a concrete file and format.
 *
 * @param specifier - Star export specifier value.
 * @param parentPath - Path of the module containing the export.
 * @returns Resolved path and format, or null if resolution fails.
 * @see https://github.com/DataDog/dd-trace-js/blob/master/packages/datadog-esbuild/src/utils.js
 */
function resolveStarExportSpecifier(
  specifier: string,
  parentPath: string,
): { path: string; format: "module" | "commonjs" } | null {
  const parentDir = path.dirname(parentPath);
  let resolved: string;

  if (specifier.startsWith("file://")) {
    resolved = fileURLToPath(specifier);
  } else if (specifier.startsWith(".") || specifier.startsWith("/")) {
    resolved = path.resolve(parentDir, specifier);
  } else {
    if (!isBareSpecifier(specifier) || BUILTINS.has(specifier)) {
      return null;
    }
    try {
      resolved = resolveModule(specifier, parentDir);
    } catch {
      return null;
    }
  }

  const format = isESMFile(resolved) ? "module" : "commonjs";
  return { path: resolved, format };
}

/**
 * Resolve export names for an ESM proxy, expanding `export *` re-exports.
 *
 * @param filePath - Absolute path to the module file.
 * @param format - Module format for export detection.
 * @param visited - Cycle guard for re-exports.
 * @returns Export names for proxy generation.
 * @see https://github.com/DataDog/dd-trace-js/blob/master/packages/datadog-esbuild/src/utils.js
 */
export async function resolveExportNames(
  filePath: string,
  format: "module" | "commonjs" = "module",
  visited: Set<string> = new Set<string>(),
): Promise<string[]> {
  if (visited.has(filePath)) return [];
  visited.add(filePath);

  let exportNames = await getExportsFromModule(filePath, format);
  if (exportNames.length === 0) {
    try {
      exportNames = parseExportsFromSource(readFileSync(filePath, "utf8"));
    } catch {
      exportNames = [];
    }
  }

  const resolvedNames = new Set<string>();
  for (const name of exportNames) {
    if (isStarExportLine(name)) {
      const specifier = name.slice(7);
      const resolved = resolveStarExportSpecifier(specifier, filePath);
      if (!resolved) continue;
      const nested = await resolveExportNames(
        resolved.path,
        resolved.format,
        visited,
      );
      for (const nestedName of nested) {
        resolvedNames.add(nestedName);
      }
    } else {
      resolvedNames.add(name);
    }
  }

  return [...resolvedNames];
}

/**
 * Generate ESM proxy code that registers with import-in-the-middle.
 *
 * @param originalPath - Absolute path to the target module.
 * @param rawImportPath - Import specifier as written by the importer.
 * @param exportNames - List of export names to proxy.
 * @param isBuiltin - Whether the module is a Node.js builtin.
 * @returns Proxy module source code.
 * @see https://github.com/DataDog/dd-trace-js/blob/master/packages/datadog-esbuild/index.js
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

  // Generate setter/getter wiring so import-in-the-middle can
  // track updates.
  const setterCode = exportNames
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

  return `
import { register } from 'import-in-the-middle/lib/register.js';
import * as namespace from ${JSON.stringify(importPath)};

  // _ is the proxy module object that import-in-the-middle will
  // wrap.
const _ = Object.create(null, { [Symbol.toStringTag]: { value: 'Module' } });
const set = {};
const get = {};

${setterCode}

register(${JSON.stringify(moduleUrl)}, _, set, get, ${JSON.stringify(rawImportPath)});
`;
}
