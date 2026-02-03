/**
 * Banner generation for esbuild init code injection.
 *
 * The banner is constructed from a small preamble plus shared init logic
 * so ESM and CJS stay consistent without duplicating the full snippet.
 *
 * @module
 */

import { serializeExclusionsToCode } from "./constants";
import type { GitMetadata } from "./git";

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
// Shared init matches dd-trace esbuild banner behavior:
// https://github.com/DataDog/dd-trace-js/blob/master/packages/datadog-esbuild/index.js
function getESMInitLogic(initOptionsCode: string): string {
  return `
if (__isMainThread) {
  const __tracer = ddTrace;
  const __ddTraceInitOptions = ${initOptionsCode};
  __tracer.init(__ddTraceInitOptions);
  if (process.env.DD_TRACE_DEBUG) console.log("[dd-trace] initialized");
  const __tracerProvider = new __tracer.TracerProvider();
  __tracerProvider.register();
  if (process.env.DD_TRACE_DEBUG) console.log("[dd-trace] TracerProvider registered");
  if (typeof __Module.register === "function") {
    __Module.register("dd-trace/loader-hook.mjs", __baseUrl, { data: { exclude: __iitmExclusions } });
    if (process.env.DD_TRACE_DEBUG) console.log("[dd-trace] ESM loader hook registered");
  }
}`;
}

function getCJSInitLogic(initOptionsCode: string): string {
  return `
if (__isMainThread) {
  const __tracer = require("dd-trace");
  const __ddTraceInitOptions = ${initOptionsCode};
  __tracer.init(__ddTraceInitOptions);
  if (process.env.DD_TRACE_DEBUG) console.log("[dd-trace] initialized");
  const __tracerProvider = new __tracer.TracerProvider();
  __tracerProvider.register();
  if (process.env.DD_TRACE_DEBUG) console.log("[dd-trace] TracerProvider registered");
  if (typeof __Module.register === "function") {
    __Module.register("dd-trace/loader-hook.mjs", __baseUrl, { data: { exclude: __iitmExclusions } });
    if (process.env.DD_TRACE_DEBUG) console.log("[dd-trace] ESM loader hook registered");
  }
}`;
}

// -----------------------------------------------------------------------------
// ESM Preamble
// -----------------------------------------------------------------------------

/**
 * Build the ESM preamble used by the shared init snippet.
 *
 * @param includeExclusions - Whether to include loader hook metadata.
 * @returns Preamble source code for an ESM banner.
 * @see https://github.com/DataDog/dd-trace-js/blob/master/packages/datadog-esbuild/index.js
 */
function getESMPreamble(
  includeExclusions: boolean,
  includeInit: boolean,
): string {
  // ESM globals align with dd-trace esbuild banner:
  // https://github.com/DataDog/dd-trace-js/blob/master/packages/datadog-esbuild/index.js
  const lines = [
    'import * as __Module from "node:module";',
    ...(includeInit ? ['import ddTrace from "dd-trace";'] : []),
    'import { createRequire as __createRequire } from "node:module";',
    'import { fileURLToPath as __fileURLToPath, pathToFileURL as __pathToFileURL } from "node:url";',
    'import { dirname as __dirnameFn } from "node:path";',
  ];

  if (includeExclusions) {
    lines.push(
      'import { isMainThread as __isMainThread } from "node:worker_threads";',
    );
  }

  lines.push(
    'const __ddFilename = typeof __filename === "string" ? __filename : __fileURLToPath(import.meta.url);',
    "const __ddRequire = __createRequire(__ddFilename);",
    'const __ddDirname = typeof __dirname === "string" ? __dirname : __dirnameFn(__ddFilename);',
  );

  if (includeExclusions) {
    lines.push(
      'const __baseUrl = typeof __filename === "string" ? __pathToFileURL(__filename) : import.meta.url;',
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
 * @see https://github.com/DataDog/dd-trace-js/blob/master/packages/datadog-esbuild/index.js
 */
function getCJSPreamble(): string {
  return [
    'const { isMainThread: __isMainThread } = require("node:worker_threads");',
    'const __Module = require("node:module");',
    "const { createRequire: __createRequire } = __Module;",
    "const __ddRequire = __createRequire(__filename);",
    'const { pathToFileURL: __pathToFileURL } = require("node:url");',
    "const __baseUrl = __pathToFileURL(__filename);",
    `const __iitmExclusions = ${serializeExclusionsToCode()};`,
  ].join("\n");
}

/**
 * Generate JS to inject git metadata into process.env.
 *
 * @param metadata - Optional git metadata.
 * @returns Banner source that sets git metadata env vars.
 * @see https://github.com/DataDog/dd-trace-js/blob/master/packages/datadog-esbuild/index.js
 */
function getGitMetadataBanner(metadata?: GitMetadata): string {
  if (!metadata?.repositoryURL && !metadata?.commitSHA) return "";

  return `if (typeof process === "object" && process !== null &&
  process.env !== null && typeof process.env === "object") {
${metadata.repositoryURL ? `  process.env.DD_GIT_REPOSITORY_URL = ${JSON.stringify(metadata.repositoryURL)};` : ""}
${metadata.commitSHA ? `  process.env.DD_GIT_COMMIT_SHA = ${JSON.stringify(metadata.commitSHA)};` : ""}
}`;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Generate the ESM banner for esbuild.
 *
 * @param autoInit - Whether to include dd-trace initialization.
 * @param gitMetadata - Optional git metadata to inject.
 * @returns Banner source code to prepend.
 * @see https://github.com/DataDog/dd-trace-js/blob/master/packages/datadog-esbuild/index.js
 */
export function generateESMInitBanner(
  autoInit: boolean,
  gitMetadata?: GitMetadata,
  initOptionsCode = "undefined",
): string {
  const gitBanner = getGitMetadataBanner(gitMetadata);
  const preamble = getESMPreamble(autoInit, autoInit);
  const init = autoInit ? getESMInitLogic(initOptionsCode) : "";

  // Minimal banner keeps require available for CJS packages.
  return [gitBanner, preamble, init].filter(Boolean).join("\n");
}

/**
 * Generate the CJS banner for esbuild.
 * Only generated when autoInit is true (CJS doesn't need a banner otherwise).
 *
 * @param autoInit - Whether to include dd-trace initialization.
 * @param gitMetadata - Optional git metadata to inject.
 * @returns Banner source code to prepend.
 * @see https://github.com/DataDog/dd-trace-js/blob/master/packages/datadog-esbuild/index.js
 */
export function generateCJSInitBanner(
  autoInit: boolean = true,
  gitMetadata?: GitMetadata,
  initOptionsCode = "undefined",
): string {
  const gitBanner = getGitMetadataBanner(gitMetadata);
  const preamble = autoInit ? getCJSPreamble() : "";
  const init = autoInit ? getCJSInitLogic(initOptionsCode) : "";

  return [gitBanner, preamble, init].filter(Boolean).join("\n");
}

/**
 * Generate the rollup banner used for Nitro auto-init.
 *
 * @param initOptionsCode - Serialized dd-trace init options.
 * @returns Banner source code to prepend.
 */
export function generateRollupInitBanner(initOptionsCode: string): string {
  return `// Auto-injected by unplugin-datadog-apm\n${generateESMInitBanner(
    true,
    undefined,
    initOptionsCode,
  )}`;
}
