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

function interceptModuleExportsAssignments(
  code: string,
  captureVar: string,
): string {
  let ast: Node & { body: Node[] };
  try {
    ast = parse(code, {
      ecmaVersion: "latest",
      sourceType: "script",
    }) as Node & { body: Node[] };
  } catch {
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
      s.prependLeft(assignment.left.start, `${captureVar} = `);
    },
  });
  return s.toString();
}

/**
 * Wrap a CommonJS module for CJS output format.
 *
 * Captures module.exports inline so the value is available even after
 * bundlers transform the code (e.g., rollup's commonjs plugin).
 *
 * Pattern:
 * 1. Declare __dd_mod__ to capture exports
 * 2. Intercept module.exports assignments
 * 3. Publish to diagnostic channel with captured value
 */
export function wrapCommonJSModule(
  originalCode: string,
  moduleInfo: { pkg: string; path: string; version: string },
): string {
  const pkgPath = moduleInfo.path
    ? `${moduleInfo.pkg}/${moduleInfo.path}`
    : moduleInfo.pkg;

  // Intercept module.exports assignments to capture the value
  const intercepted = interceptModuleExportsAssignments(
    originalCode,
    "__dd_mod__",
  );

  return `var __dd_mod__;
${intercepted}
;(function() {
  var dc = require('dc-polyfill');
  var ch = dc.channel('${CHANNEL}');
  var mod = typeof __dd_mod__ !== 'undefined' ? __dd_mod__ : (typeof module !== 'undefined' ? module.exports : undefined);
  if (mod) {
    var payload = {
      module: mod,
      version: '${moduleInfo.version}',
      package: '${moduleInfo.pkg}',
      path: '${pkgPath}'
    };
    ch.publish(payload);
    if (typeof module !== 'undefined') module.exports = payload.module;
  }
})();
`;
}

/**
 * Wrap a CommonJS module for ESM output format.
 *
 * Uses import statement at the top which bundlers convert appropriately.
 * Also captures exports in a way that works after CJS-to-ESM conversion.
 */
export function wrapCommonJSModuleForESM(
  originalCode: string,
  moduleInfo: { pkg: string; path: string; version: string },
): string {
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
    ch.publish(payload);
  }
})();
`;
}
