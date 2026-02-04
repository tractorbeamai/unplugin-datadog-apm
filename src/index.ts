/**
 * Unplugin for Datadog APM instrumentation.
 *
 * Enables dd-trace to instrument bundled modules by:
 * 1. Wrapping CommonJS modules to publish to 'dd-trace:bundler:load' channel
 * 2. Creating ESM proxy modules using import-in-the-middle for dd-trace interception
 *
 * Use with node --import unplugin-datadog-apm/register for initialization.
 *
 * Based on datadog-esbuild: https://github.com/DataDog/dd-trace-js/tree/master/packages/datadog-esbuild
 *
 * @see https://docs.datadoghq.com/tracing/trace_collection/automatic_instrumentation/dd_libraries/nodejs
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { createConsola } from "consola";
import {
  createUnplugin,
  type UnpluginFactory,
  type UnpluginInstance,
} from "unplugin";

import { createEsbuildConfig } from "./bundlers/esbuild";
import { createRolldownConfig } from "./bundlers/rolldown";
import { createRollupConfig } from "./bundlers/rollup";
import { createRspackConfig } from "./bundlers/rspack";
import { createViteConfig } from "./bundlers/vite";
import { createWebpackConfig } from "./bundlers/webpack";
import {
  wrapCommonJSModule,
  wrapCommonJSModuleForESM,
} from "./core/cjs-wrapper";
import { ESM_PROXY_SUFFIX, NODE_MODULES } from "./core/constants";
import {
  ddTraceHooks,
  extractPackageAndModulePath,
  isESMFile,
} from "./core/dd-trace";
import { generateESMProxy, resolveExportNames } from "./core/esm-proxy";
import { getGitMetadata } from "./core/git";
import { resolveOptions, type Options } from "./core/options";
import { BUILTINS, getBaseModuleName, resolveModule } from "./core/resolve";
import type { ModuleInfo, PluginData } from "./core/types";

const logger = createConsola({ level: -1 }).withTag("datadog");

// Use createRequire for loading dd-trace at runtime.
const require = createRequire(import.meta.url);

/**
 * Check if a source file should be rewritten for IAST.
 *
 * @param id - Module id or path.
 * @returns True for eligible application JS files.
 * @see https://github.com/DataDog/dd-trace-js/blob/master/packages/datadog-esbuild/index.js
 */
function isIastCandidate(id: string): boolean {
  if (id.endsWith(ESM_PROXY_SUFFIX)) return false;
  if (id.includes(NODE_MODULES)) return false;
  return /\.(?:cjs|mjs|js)$/.test(id);
}

/**
 * Build the plugin factory used by unplugin.
 *
 * @param rawOptions - User-provided options for the plugin.
 */
const createDatadogApmPlugin: UnpluginFactory<Options | undefined, false> = (
  rawOptions = {},
) => {
  const options = resolveOptions(rawOptions);
  const { debug, additionalModules, excludeModules } = options;
  const iastEnabled =
    process.env.DD_IAST_ENABLED?.toLowerCase() === "true" ||
    process.env.DD_IAST_ENABLED === "1";

  // Combined set of modules to instrument (from dd-trace + additional).
  const modulesToInstrument = new Set([...ddTraceHooks, ...additionalModules]);
  for (const m of excludeModules) {
    modulesToInstrument.delete(m);
  }

  // Cache for resolved module info.
  const moduleInfoCache = new Map<string, PluginData>();

  // Track ESM modules that need proxy generation.
  // Keep a separate alias map because webpack calls `load()` with the raw
  // specifier while rollup-like bundlers call `load()` with the proxy id.
  const esmProxyInfoByProxyId = new Map<string, ModuleInfo>();
  const esmProxyAliasToProxyId = new Map<string, string>();

  // Lazy IAST rewriter instance, when enabled.
  let iastRewriter: {
    rewrite: (
      code: string,
      filename: string,
      features: string[],
    ) => { content: string };
  } | null = null;

  /**
   * Lazily load the dd-trace IAST rewriter when enabled.
   *
   * @returns Rewriter instance or null when unavailable.
   * @see https://github.com/DataDog/dd-trace-js/blob/master/packages/datadog-esbuild/index.js
   */
  const getIastRewriter = () => {
    if (!iastEnabled) return null;
    if (iastRewriter) return iastRewriter;
    try {
      const module =
        require("dd-trace/src/appsec/iast/taint-tracking/rewriter") as {
          getRewriter: () => {
            rewrite: (
              code: string,
              filename: string,
              features: string[],
            ) => { content: string };
          };
        };
      iastRewriter = module.getRewriter();
      return iastRewriter;
    } catch (error) {
      logger.warn("IAST rewriter unavailable:", error);
      return null;
    }
  };

  // Track output format for format-aware wrapping.
  let outputFormat: "cjs" | "esm" | "unknown" = "unknown";

  // Rollup-based bundlers can convert our CJS wrapper into ESM at render time.
  // When that conversion is available, we always emit the CJS wrapper in `transform()`.
  let usesRenderChunkWrapperConversion = false;

  // Set log level based on debug flag.
  if (debug) {
    logger.level = 4; // debug level
  }

  /**
   * Update the tracked output format for esbuild.
   *
   * @param format - Output format reported by the bundler.
   */
  const handleEsbuildOutputFormat = (format: "cjs" | "esm") => {
    outputFormat = format;
  };

  /**
   * Update the tracked output format for rollup-like bundlers.
   *
   * @param format - Output format reported by the bundler.
   */
  const handleRollupOutputFormat = (format: "cjs" | "esm") => {
    outputFormat = format;
  };

  /**
   * Track whether renderChunk conversion is available.
   *
   * @param uses - Whether renderChunk wrapper conversion is in use.
   */
  const handleRenderChunkWrapperConversion = (uses: boolean) => {
    usesRenderChunkWrapperConversion = uses;
  };

  return {
    name: "unplugin-datadog-apm",
    enforce: "pre",

    /**
     * Log instrumentation setup details at build start.
     */
    buildStart() {
      const gitMeta = getGitMetadata();
      if (gitMeta.repositoryURL || gitMeta.commitSHA) {
        logger.debug("Git metadata:", gitMeta);
      }
      logger.debug(
        `Loaded ${ddTraceHooks.size} instrumentable modules from dd-trace`,
      );
    },

    /**
     * Resolve module ids and decide whether to wrap or proxy them.
     */
    resolveId(importee, importer) {
      // Non-entry imports need an importer so we can resolve relative ids.
      if (!importer) return null;

      // Check if this is an ESM proxy request (marked with suffix).
      if (importee.endsWith(ESM_PROXY_SUFFIX)) {
        return importee;
      }

      // Skip local imports from app code.
      if (importee.startsWith(".") && !importer.includes(NODE_MODULES)) {
        // Local modules are not dd-trace targets, so avoid overhead.
        return null;
      }

      // Skip excluded modules.
      if (excludeModules.includes(importee)) {
        return null;
      }

      // Get base module name.
      const baseModule = getBaseModuleName(importee);
      const isBuiltin = BUILTINS.has(importee);

      // Check if we should instrument this module.
      if (!modulesToInstrument.has(baseModule) && !isBuiltin) {
        // If dd-trace doesn't recognize the module, we skip wrapping.
        return null;
      }

      // Builtins are handled at runtime by dd-trace loader.
      if (isBuiltin) {
        // Returning null keeps Node builtins untouched in the bundle.
        logger.debug(`Builtin (runtime): ${importee}`);
        return null;
      }

      // Resolve the module.
      let fullPath: string;
      try {
        fullPath = resolveModule(importee, path.dirname(importer));
      } catch {
        logger.debug(`Could not resolve: ${importee}`);
        return null;
      }

      // Extract package info.
      const extracted = extractPackageAndModulePath(fullPath);
      if (!extracted) {
        // If we can't map a package, we can't publish instrumentation.
        return null;
      }

      // Get package version and type.
      let version = "unknown";
      let packageJson: { type?: string; version?: string } = {};
      if (existsSync(extracted.pkgJson)) {
        try {
          packageJson = JSON.parse(readFileSync(extracted.pkgJson, "utf8")) as {
            type?: string;
            version?: string;
          };
          version = packageJson.version ?? "unknown";
        } catch {
          // Ignore
        }
      }

      const isESM = isESMFile(fullPath, extracted.pkgJson, packageJson);

      logger.debug(
        `Resolved: ${importee}@${version} (${isESM ? "ESM" : "CJS"})`,
      );

      const info: ModuleInfo = {
        extractedModule: extracted,
        version,
        fullPath,
        isESM,
        isBuiltin: false,
        rawImportPath: importee,
      };

      // For ESM, redirect to proxy module (use full path with suffix).
      if (isESM) {
        // The proxy id is stable and lets load() return proxy code later.
        const proxyId = fullPath + ESM_PROXY_SUFFIX;
        esmProxyInfoByProxyId.set(proxyId, info);
        esmProxyAliasToProxyId.set(proxyId, proxyId);
        esmProxyAliasToProxyId.set(importee, proxyId);
        moduleInfoCache.set(proxyId, { info, shouldWrap: true });
        return proxyId;
      }

      // For CJS, we'll transform in the transform hook.
      moduleInfoCache.set(fullPath, { info, shouldWrap: true });
      return fullPath;
    },

    /**
     * Restrict load hook to virtual modules and proxies.
     */
    loadInclude(id) {
      return (
        id.endsWith(ESM_PROXY_SUFFIX) || esmProxyAliasToProxyId.has(id) // For webpack: id is the raw import path
      );
    },

    /**
     * Provide module contents for virtual modules and proxies.
     */
    async load(id) {
      // Handle ESM proxy modules.
      // Proxy id for rollup-like bundlers, raw import for webpack.
      const proxyId = esmProxyAliasToProxyId.get(id) ?? id;
      const info = esmProxyInfoByProxyId.get(proxyId);
      if (!info) return null;

      const originalPath = info.fullPath;

      logger.debug(
        `Creating ESM proxy: ${info.extractedModule.pkg}@${info.version}`,
      );

      // Read the original module to resolve exports.
      let exportNames: string[];
      try {
        exportNames = await resolveExportNames(originalPath, "module");

        // If we found no exports, fall back to common patterns.
        if (exportNames.length === 0) {
          // A default export keeps the proxy usable for most CJS builds.
          logger.debug(
            `No exports detected for ${info.extractedModule.pkg}, falling back to default export`,
          );
          exportNames = ["default"];
        }
      } catch (error) {
        // Parsing errors shouldn't block the build; default export is safe.
        logger.warn(`Could not parse exports for ${originalPath}:`, error);
        exportNames = ["default"];
      }

      const proxyCode = generateESMProxy(
        originalPath,
        info.rawImportPath,
        exportNames,
        info.isBuiltin,
      );

      return proxyCode;
    },

    /**
     * Restrict transform to CJS modules that should be wrapped.
     */
    transformInclude(id) {
      const cached = moduleInfoCache.get(id);
      return cached?.shouldWrap && !cached.info.isESM;
    },

    /**
     * Wrap CJS modules so dd-trace can observe their exports.
     */
    transform(code, id) {
      const cleanId = id.split("?")[0] ?? id;
      if (iastEnabled && isIastCandidate(cleanId)) {
        const rewriter = getIastRewriter();
        if (rewriter) {
          const rewritten = rewriter.rewrite(code, cleanId, ["iast"]);
          return { code: rewritten.content, map: null };
        }
      }

      const cached = moduleInfoCache.get(id);
      if (!cached?.shouldWrap) return null;

      const { info } = cached;

      // ESM is handled in load().
      if (info.isESM) return null;

      logger.debug(
        `Wrapping CJS: ${info.extractedModule.pkg}@${info.version} (format: ${outputFormat})`,
      );

      // Use format-aware wrapper. Rollup-like bundlers may convert CJS
      // to ESM later, so we keep the wrapper simple when conversion
      // is available.
      const moduleInfo = {
        pkg: info.extractedModule.pkg,
        path: info.extractedModule.path,
        version: info.version,
      };

      const wrapped =
        outputFormat === "esm" && !usesRenderChunkWrapperConversion
          ? wrapCommonJSModuleForESM(code, moduleInfo)
          : wrapCommonJSModule(code, moduleInfo);

      return { code: wrapped, map: null };
    },

    /**
     * Log summary counts for wrapped modules.
     */
    buildEnd() {
      const cjsCount = [...moduleInfoCache.values()].filter(
        (d) => d.shouldWrap && !d.info.isESM,
      ).length;
      const esmCount = esmProxyInfoByProxyId.size;
      if (cjsCount > 0 || esmCount > 0) {
        logger.info(`Instrumented ${cjsCount} CJS + ${esmCount} ESM modules`);
      }
    },

    esbuild: createEsbuildConfig({
      logger,
      setOutputFormat: handleEsbuildOutputFormat,
    }),

    rollup: createRollupConfig({
      logger,
      setOutputFormat: handleRollupOutputFormat,
      setUsesRenderChunkWrapperConversion: handleRenderChunkWrapperConversion,
    }),

    rolldown: createRolldownConfig({
      logger,
      setOutputFormat: handleRollupOutputFormat,
      setUsesRenderChunkWrapperConversion: handleRenderChunkWrapperConversion,
    }),

    webpack: createWebpackConfig({
      logger,
    }),

    rspack: createRspackConfig({
      logger,
    }),

    vite: createViteConfig({
      debug,
      logger,
    }),
  };
};

/**
 * Create the unplugin instance for Datadog APM instrumentation.
 *
 * Consumers should import this via the bundler-specific entry points.
 */
export const unpluginDatadogApm: UnpluginInstance<Options | undefined, false> =
  createUnplugin(createDatadogApmPlugin);

// Named exports for entry files
export { unpluginDatadogApm as DatadogAPM };
