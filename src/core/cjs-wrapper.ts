/**
 * CommonJS module wrapping for dd-trace instrumentation.
 *
 * @module
 */

import { parse, type Node } from "acorn";
import { walk } from "estree-walker";
import MagicString from "magic-string";

import { isModuleExportsMemberExpression } from "./ast-utils";
import { CHANNEL } from "./constants";

type AssignmentExpressionNode = Node & { left: Node; operator: string };

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
  let ast: Node & { body: Node[] };
  try {
    ast = parse(code, {
      ecmaVersion: "latest",
      sourceType: "script",
    }) as Node & { body: Node[] };
  } catch {
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
  // Build a stable "pkg/path" label for diagnostics.
  const pkgPath = moduleInfo.path
    ? `${moduleInfo.pkg}/${moduleInfo.path}`
    : moduleInfo.pkg;

  // Capture module.exports so we can publish the final value.
  const intercepted = interceptModuleExportsAssignments(
    originalCode,
    "__dd_mod__",
  );

  return `var __dd_mod__;
${intercepted}
;(function() {
  // dc-polyfill exposes the diagnostic channel used by dd-trace.
  var dc = require('dc-polyfill');
  var ch = dc.channel('${CHANNEL}');
  var mod = typeof __dd_mod__ !== 'undefined' ? __dd_mod__ : (typeof module !== 'undefined' ? module.exports : undefined);
  if (mod) {
    var payload = {
      module: mod,
      version: ${JSON.stringify(moduleInfo.version)},
      package: ${JSON.stringify(moduleInfo.pkg)},
      path: ${JSON.stringify(pkgPath)}
    };
    // Publish the payload so dd-trace can observe module exports.
    ch.publish(payload);
    if (typeof module !== 'undefined') module.exports = payload.module;
  }
})();
`;
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
  // Build a stable "pkg/path" label for diagnostics.
  const pkgPath = moduleInfo.path
    ? `${moduleInfo.pkg}/${moduleInfo.path}`
    : moduleInfo.pkg;

  // For ESM output, the bundler converts module.exports to ESM exports.
  // We need to capture the exports after the conversion happens.
  // Using a top-level import ensures dc-polyfill is loaded as ESM.
  return `import * as __dd_dc from 'dc-polyfill';
var __dd_exports;
${interceptModuleExportsAssignments(originalCode, "__dd_exports")}
;(function() {
  var ch = __dd_dc.channel('${CHANNEL}');
  var mod = typeof __dd_exports !== 'undefined' ? __dd_exports : (typeof module !== 'undefined' ? module.exports : undefined);
  if (mod) {
    var payload = {
      module: mod,
      version: '${moduleInfo.version}',
      package: '${moduleInfo.pkg}',
      path: '${pkgPath}'
    };
    // Publish without reassigning module.exports in ESM output.
    ch.publish(payload);
  }
})();
`;
}
