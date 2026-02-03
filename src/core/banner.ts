/**
 * Banner generation for esbuild init code injection.
 *
 * Uses a preamble + shared logic approach to minimize duplication
 * between ESM and CJS formats.
 *
 * @module
 */

import { serializeExclusionsToCode } from "./constants";

// -----------------------------------------------------------------------------
// Shared Init Logic
// -----------------------------------------------------------------------------

/**
 * Core init logic shared between ESM and CJS banners.
 * Assumes these variables are defined by the preamble:
 * - __Module: node:module namespace
 * - __baseUrl: URL for Module.register (import.meta.url or pathToFileURL(__filename))
 * - __isMainThread: from worker_threads
 * - __iitmExclusions: array of exclusion patterns
 * - require: available natively (CJS) or via createRequire (ESM)
 */
const SHARED_INIT_LOGIC = `
if (__isMainThread) {
  const __tracer = require("dd-trace");
  __tracer.init();
  if (process.env.DD_TRACE_DEBUG) console.log("[dd-trace] initialized");
  const __tracerProvider = new __tracer.TracerProvider();
  __tracerProvider.register();
  if (process.env.DD_TRACE_DEBUG) console.log("[dd-trace] TracerProvider registered");
  if (typeof __Module.register === "function") {
    __Module.register(require.resolve("dd-trace/loader-hook.mjs"), __baseUrl, { data: { exclude: __iitmExclusions } });
    if (process.env.DD_TRACE_DEBUG) console.log("[dd-trace] ESM loader hook registered");
  }
}`;

// -----------------------------------------------------------------------------
// ESM Preamble
// -----------------------------------------------------------------------------

/**
 * ESM-specific setup that defines the variables needed by SHARED_INIT_LOGIC.
 */
function getESMPreamble(includeExclusions: boolean): string {
  const lines = [
    'import * as __Module from "node:module";',
    'import { createRequire as __createRequire } from "node:module";',
  ];

  if (includeExclusions) {
    lines.push(
      'import { isMainThread as __isMainThread } from "node:worker_threads";',
    );
  }

  lines.push("const require = __createRequire(import.meta.url);");

  if (includeExclusions) {
    lines.push(
      "const __baseUrl = import.meta.url;",
      `const __iitmExclusions = ${serializeExclusionsToCode()};`,
    );
  }

  return lines.join("\n");
}

// -----------------------------------------------------------------------------
// CJS Preamble
// -----------------------------------------------------------------------------

/**
 * CJS-specific setup that defines the variables needed by SHARED_INIT_LOGIC.
 */
function getCJSPreamble(): string {
  return [
    'const { isMainThread: __isMainThread } = require("node:worker_threads");',
    'const __Module = require("node:module");',
    'const { pathToFileURL: __pathToFileURL } = require("node:url");',
    "const __baseUrl = __pathToFileURL(__filename);",
    `const __iitmExclusions = ${serializeExclusionsToCode()};`,
  ].join("\n");
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Generate the ESM banner for esbuild.
 *
 * @param autoInit - Whether to include dd-trace initialization code
 * @returns The banner code string
 */
export function generateESMInitBanner(autoInit: boolean): string {
  if (!autoInit) {
    // Minimal banner: just set up require for CJS compatibility
    return getESMPreamble(false);
  }

  return `${getESMPreamble(true)}${SHARED_INIT_LOGIC}`;
}

/**
 * Generate the CJS banner for esbuild.
 * Only generated when autoInit is true (CJS doesn't need a banner otherwise).
 *
 * @returns The banner code string
 */
export function generateCJSInitBanner(): string {
  return `${getCJSPreamble()}${SHARED_INIT_LOGIC}`;
}
