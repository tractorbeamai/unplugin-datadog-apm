/**
 * Banner generation for esbuild init code injection.
 *
 * The banner is constructed from a small preamble plus shared init logic
 * so ESM and CJS stay consistent without duplicating the full snippet.
 *
 * @module
 */

import { serializeExclusionsToCode } from "./constants";

// -----------------------------------------------------------------------------
// Shared Init Logic
// -----------------------------------------------------------------------------

/**
 * Core init logic shared between ESM and CJS banners.
 *
 * The preamble supplies the runtime helpers used here:
 * - __Module for Module.register
 * - __baseUrl for the loader hook base URL
 * - __isMainThread to avoid worker threads
 * - __iitmExclusions for import-in-the-middle exclusions
 * - require for dd-trace loading
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
 * Build the ESM preamble used by the shared init snippet.
 *
 * @param includeExclusions - Whether to include loader hook metadata.
 * @returns Preamble source code for an ESM banner.
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
 * Build the CJS preamble used by the shared init snippet.
 *
 * @returns Preamble source code for a CJS banner.
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
 * @param autoInit - Whether to include dd-trace initialization.
 * @returns Banner source code to prepend.
 */
export function generateESMInitBanner(autoInit: boolean): string {
  if (!autoInit) {
    // Minimal banner keeps require available for CJS packages.
    return getESMPreamble(false);
  }

  return `${getESMPreamble(true)}${SHARED_INIT_LOGIC}`;
}

/**
 * Generate the CJS banner for esbuild.
 * Only generated when autoInit is true (CJS doesn't need a banner otherwise).
 *
 * @returns Banner source code to prepend.
 */
export function generateCJSInitBanner(): string {
  return `${getCJSPreamble()}${SHARED_INIT_LOGIC}`;
}
