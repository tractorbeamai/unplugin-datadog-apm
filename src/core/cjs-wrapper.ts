/**
 * CommonJS module wrapping for dd-trace instrumentation.
 *
 * @module
 */

import type { Node } from "acorn";
import { walk } from "estree-walker";
import MagicString from "magic-string";

import { isModuleExportsMemberExpression, parseScript } from "./ast-utils";
import { CHANNEL } from "./constants";

type AssignmentExpressionNode = Node & { left: Node; operator: string };

/**
 * Compute the package path label for diagnostic payloads.
 *
 * @param moduleInfo - Package and path info.
 * @returns Combined "pkg/path" string or just "pkg" if no path.
 */
function getPkgPath(moduleInfo: { pkg: string; path: string }): string {
  return moduleInfo.path
    ? `${moduleInfo.pkg}/${moduleInfo.path}`
    : moduleInfo.pkg;
}

/**
 * Generate the IIFE that publishes module exports to the diagnostic channel.
 *
 * @param options - Configuration for the IIFE generation.
 * @param options.moduleInfo - Package metadata for the diagnostic payload.
 * @param options.exportsVarName - Variable name holding captured exports (e.g., "__dd_mod__").
 * @param options.dcAccessor - Accessor for dc-polyfill (e.g., "dc" or "__dd_dc").
 * @param options.reassignModuleExports - Whether to reassign module.exports after publishing.
 * @param options.dcRequireLine - Optional require line for dc-polyfill (CJS only).
 * @param options.useJsonStringify - Whether to use JSON.stringify for payload values.
 * @returns The IIFE source code.
 */
function generatePublishIIFE(options: {
  moduleInfo: { pkg: string; path: string; version: string };
  exportsVarName: string;
  dcAccessor: string;
  reassignModuleExports: boolean;
  dcRequireLine: string | null;
  useJsonStringify: boolean;
}): string {
  const {
    moduleInfo,
    exportsVarName,
    dcAccessor,
    reassignModuleExports,
    dcRequireLine,
    useJsonStringify,
  } = options;

  const pkgPath = getPkgPath(moduleInfo);

  const versionValue = useJsonStringify
    ? JSON.stringify(moduleInfo.version)
    : `'${moduleInfo.version}'`;
  const packageValue = useJsonStringify
    ? JSON.stringify(moduleInfo.pkg)
    : `'${moduleInfo.pkg}'`;
  const pathValue = useJsonStringify ? JSON.stringify(pkgPath) : `'${pkgPath}'`;

  const dcRequire = dcRequireLine
    ? `  // dc-polyfill exposes the diagnostic channel used by dd-trace.
  ${dcRequireLine}
`
    : "";

  const publishComment = reassignModuleExports
    ? "// Publish the payload so dd-trace can observe module exports."
    : "// Publish without reassigning module.exports in ESM output.";

  const moduleExportsReassign = reassignModuleExports
    ? "\n    if (typeof module !== 'undefined') module.exports = payload.module;"
    : "";

  return `;(function() {
${dcRequire}  var ch = ${dcAccessor}.channel('${CHANNEL}');
  var mod = typeof ${exportsVarName} !== 'undefined' ? ${exportsVarName} : (typeof module !== 'undefined' ? module.exports : undefined);
  if (mod) {
    var payload = {
      module: mod,
      version: ${versionValue},
      package: ${packageValue},
      path: ${pathValue}
    };
    ${publishComment}
    ch.publish(payload);${moduleExportsReassign}
  }
})();
`;
}

/**
 * Capture module.exports assignments by injecting a capture variable.
 *
 * Uses AST rewriting when parsing succeeds and falls back to simple
 * string replacements when the script cannot be parsed.
 *
 * @param code - Original CommonJS source.
 * @param captureVar - Variable name that should receive module.exports.
 * @returns Updated source that assigns module.exports into captureVar.
 */
function interceptModuleExportsAssignments(
  code: string,
  captureVar: string,
): string {
  // Prefer AST rewriting so we only touch real assignments, not strings.
  const ast = parseScript(code, "script");
  if (!ast) {
    // Fallback keeps us resilient when parsing fails (e.g. stage-3 syntax).
    return code
      .replaceAll(/module\.exports\s*=/g, `${captureVar} = module.exports =`)
      .replaceAll(
        /module\["exports"\]\s*=/g,
        `${captureVar} = module["exports"] =`,
      );
  }

  const s = new MagicString(code);

  const walkNode = walk as unknown as (
    node: Node,
    visitors: { enter: (node: Node) => void },
  ) => void;

  walkNode(ast, {
    enter(node: Node) {
      if (node.type !== "AssignmentExpression") return;
      const assignment = node as AssignmentExpressionNode;
      if (assignment.operator !== "=") return;
      if (!isModuleExportsMemberExpression(assignment.left)) return;
      // Inject captureVar = before the assignment target.
      s.prependLeft(assignment.left.start, `${captureVar} = `);
    },
  });
  return s.toString();
}

/**
 * Wrap a CommonJS module for CJS output format.
 *
 * Captures module.exports inline so the value is available even after
 * bundlers transform the code (for example via commonjs transforms).
 *
 * @param originalCode - Original CommonJS source.
 * @param moduleInfo - Package metadata for the diagnostic payload.
 * @returns Wrapped source with diagnostic channel publishing.
 */
export function wrapCommonJSModule(
  originalCode: string,
  moduleInfo: { pkg: string; path: string; version: string },
): string {
  // Capture module.exports so we can publish the final value.
  const intercepted = interceptModuleExportsAssignments(
    originalCode,
    "__dd_mod__",
  );

  const iife = generatePublishIIFE({
    moduleInfo,
    exportsVarName: "__dd_mod__",
    dcAccessor: "dc",
    reassignModuleExports: true,
    dcRequireLine: "var dc = require('dc-polyfill');",
    useJsonStringify: true,
  });

  return `var __dd_mod__;
${intercepted}
${iife}`;
}

/**
 * Wrap a CommonJS module for ESM output format.
 *
 * Uses an ESM import for dc-polyfill so bundlers can rewrite it, and
 * captures exports after CJS-to-ESM conversion happens.
 *
 * @param originalCode - Original CommonJS source.
 * @param moduleInfo - Package metadata for the diagnostic payload.
 * @returns Wrapped source with diagnostic channel publishing.
 */
export function wrapCommonJSModuleForESM(
  originalCode: string,
  moduleInfo: { pkg: string; path: string; version: string },
): string {
  // For ESM output, the bundler converts module.exports to ESM exports.
  // We need to capture the exports after the conversion happens.
  // Using a top-level import ensures dc-polyfill is loaded as ESM.
  const intercepted = interceptModuleExportsAssignments(
    originalCode,
    "__dd_exports",
  );

  const iife = generatePublishIIFE({
    moduleInfo,
    exportsVarName: "__dd_exports",
    dcAccessor: "__dd_dc",
    reassignModuleExports: false,
    dcRequireLine: null,
    useJsonStringify: false,
  });

  return `import * as __dd_dc from 'dc-polyfill';
var __dd_exports;
${intercepted}
${iife}`;
}
