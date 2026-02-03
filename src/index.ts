/**
 * Unplugin for Datadog APM instrumentation.
 *
 * Enables dd-trace to instrument bundled modules by:
 * 1. Wrapping CommonJS modules to publish to 'dd-trace:bundler:load' channel
 * 2. Creating ESM proxy modules using import-in-the-middle for dd-trace interception
 *
 * Based on datadog-esbuild: https://github.com/DataDog/dd-trace-js/tree/master/packages/datadog-esbuild
 *
 * @see https://docs.datadoghq.com/tracing/trace_collection/automatic_instrumentation/dd_libraries/nodejs
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { createConsola } from "consola";
import { createUnplugin, type UnpluginInstance } from "unplugin";

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
import {
  ENTRY_WRAPPER_PREFIX,
  ESM_PROXY_SUFFIX,
  NODE_MODULES,
} from "./core/constants";
import {
  ddTraceHooks,
  extractPackageAndModulePath,
  isESMFile,
} from "./core/dd-trace";
import { generateEntryWrapper } from "./core/entry-wrapper";
import { generateESMProxy, parseExportsFromSource } from "./core/esm-proxy";
import { getGitMetadata } from "./core/git";
import { resolveOptions, type Options } from "./core/options";
import { BUILTINS, getBaseModuleName, resolveModule } from "./core/resolve";
import type { ModuleInfo, PluginData } from "./core/types";

const logger = createConsola({ level: -1 }).withTag("datadog");

// Use createRequire for loading dd-trace at runtime
const require = createRequire(import.meta.url);

export const unpluginDatadogApm: UnpluginInstance<Options | undefined, false> =
  createUnplugin((rawOptions = {}) => {
    const options = resolveOptions(rawOptions);
    const { debug, additionalModules, excludeModules, autoInit } = options;

    // Combined set of modules to instrument (from dd-trace + additional)
    const modulesToInstrument = new Set([
      ...ddTraceHooks,
      ...additionalModules,
    ]);
    for (const m of excludeModules) {
      modulesToInstrument.delete(m);
    }

    // Cache for resolved module info
    const moduleInfoCache = new Map<string, PluginData>();

    // Track ESM modules that need proxy generation.
    // We keep a separate alias map because webpack will call `load()` with the raw
    // import specifier, while rollup-based bundlers call `load()` with the proxy id.
    const esmProxyInfoByProxyId = new Map<string, ModuleInfo>();
    const esmProxyAliasToProxyId = new Map<string, string>();

    // Track wrapped entry points (original path -> true)
    const wrappedEntries = new Set<string>();

    // If true, the bundler has already injected auto-init via a banner, so we should
    // not wrap entry points.
    let autoInitHandledByBanner = false;

    // Track output format for format-aware wrapping
    let outputFormat: "cjs" | "esm" | "unknown" = "unknown";

    // Rollup-based bundlers can convert our CJS wrapper into ESM at render time.
    // When that conversion is available, we always emit the CJS wrapper in `transform()`.
    let usesRenderChunkWrapperConversion = false;

    // Set log level based on debug flag
    if (debug) {
      logger.level = 4; // debug level
    }

    return {
      name: "unplugin-datadog-apm",
      enforce: "pre",

      buildStart() {
        const gitMeta = getGitMetadata();
        if (gitMeta.repositoryURL || gitMeta.commitSHA) {
          logger.debug("Git metadata:", gitMeta);
        }
        logger.debug(
          `Loaded ${ddTraceHooks.size} instrumentable modules from dd-trace`,
        );
        logger.info(`Auto-init: ${autoInit ? "enabled" : "disabled"}`);
      },

      resolveId(importee, importer, resolveOptions) {
        // Handle entry wrapper virtual modules
        if (importee.startsWith(ENTRY_WRAPPER_PREFIX)) {
          return importee;
        }

        // Helper to get resolve directory from importer
        const getResolveDir = () =>
          importer ? path.dirname(importer) : process.cwd();

        // Check if this is an entry point we should wrap (using bundler's isEntry flag)
        const isEntry = resolveOptions.isEntry;

        // Wrap entry points to ensure dd-trace is initialized first.
        // If the bundler has already handled auto-init via a banner, skip wrapping.
        if (autoInit && isEntry && !autoInitHandledByBanner) {
          // Resolve the actual path for the entry
          let resolvedPath: string;

          if (path.isAbsolute(importee)) {
            resolvedPath = importee;
          } else if (importee.startsWith(".")) {
            resolvedPath = path.resolve(getResolveDir(), importee);
          } else {
            // Bare specifier - resolve it
            try {
              resolvedPath = resolveModule(importee, getResolveDir());
            } catch (error) {
              logger.debug(
                `Could not resolve entry ${importee}: ${error instanceof Error ? error.message : error}`,
              );
              return null;
            }
          }

          // Skip if already wrapped
          if (!wrappedEntries.has(resolvedPath)) {
            wrappedEntries.add(resolvedPath);
            logger.debug(`Wrapping entry point: ${resolvedPath}`);
            return ENTRY_WRAPPER_PREFIX + resolvedPath;
          }
        }

        if (!importer) return null;

        // Check if this is an ESM proxy request (marked with suffix)
        if (importee.endsWith(ESM_PROXY_SUFFIX)) {
          return importee;
        }

        // Skip local imports from app code
        if (importee.startsWith(".") && !importer.includes(NODE_MODULES)) {
          return null;
        }

        // Skip excluded modules
        if (excludeModules.includes(importee)) {
          return null;
        }

        // Get base module name
        const baseModule = getBaseModuleName(importee);
        const isBuiltin = BUILTINS.has(importee);

        // Check if we should instrument this module
        if (!modulesToInstrument.has(baseModule) && !isBuiltin) {
          return null;
        }

        // Builtins are handled at runtime by dd-trace loader
        if (isBuiltin) {
          logger.debug(`Builtin (runtime): ${importee}`);
          return null;
        }

        // Resolve the module
        let fullPath: string;
        try {
          fullPath = resolveModule(importee, path.dirname(importer));
        } catch {
          logger.debug(`Could not resolve: ${importee}`);
          return null;
        }

        // Extract package info
        const extracted = extractPackageAndModulePath(fullPath);
        if (!extracted) {
          return null;
        }

        // Get package version and type
        let version = "unknown";
        let packageJson: { type?: string; version?: string } = {};
        if (existsSync(extracted.pkgJson)) {
          try {
            packageJson = JSON.parse(
              readFileSync(extracted.pkgJson, "utf8"),
            ) as { type?: string; version?: string };
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

        // For ESM, redirect to proxy module (use full path with suffix)
        if (isESM) {
          const proxyId = fullPath + ESM_PROXY_SUFFIX;
          esmProxyInfoByProxyId.set(proxyId, info);
          esmProxyAliasToProxyId.set(proxyId, proxyId);
          esmProxyAliasToProxyId.set(importee, proxyId);
          moduleInfoCache.set(proxyId, { info, shouldWrap: true });
          return proxyId;
        }

        // For CJS, we'll transform in the transform hook
        moduleInfoCache.set(fullPath, { info, shouldWrap: true });
        return fullPath;
      },

      loadInclude(id) {
        return (
          id.endsWith(ESM_PROXY_SUFFIX) ||
          id.startsWith(ENTRY_WRAPPER_PREFIX) ||
          esmProxyAliasToProxyId.has(id) // For webpack: id is the raw import path
        );
      },

      load(id) {
        // Handle entry wrapper virtual modules
        if (id.startsWith(ENTRY_WRAPPER_PREFIX)) {
          const originalPath = id.slice(ENTRY_WRAPPER_PREFIX.length);
          logger.debug(`Generating entry wrapper for: ${originalPath}`);
          return generateEntryWrapper(originalPath);
        }

        // Handle ESM proxy modules (proxy id for rollup-based bundlers, raw import for webpack)
        const proxyId = esmProxyAliasToProxyId.get(id) ?? id;
        const info = esmProxyInfoByProxyId.get(proxyId);
        if (!info) return null;

        const originalPath = info.fullPath;

        logger.debug(
          `Creating ESM proxy: ${info.extractedModule.pkg}@${info.version}`,
        );

        // Read the original module to parse exports
        let exportNames: string[];
        try {
          const code = readFileSync(originalPath, "utf8");
          exportNames = parseExportsFromSource(code);

          // If we found no exports, fall back to common patterns
          if (exportNames.length === 0) {
            logger.debug(
              `No exports detected for ${info.extractedModule.pkg}, falling back to default export`,
            );
            exportNames = ["default"];
          }
        } catch (error) {
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

      transformInclude(id) {
        const cached = moduleInfoCache.get(id);
        return cached?.shouldWrap && !cached.info.isESM;
      },

      transform(code, id) {
        const cached = moduleInfoCache.get(id);
        if (!cached?.shouldWrap) return null;

        const { info } = cached;

        // ESM is handled in load()
        if (info.isESM) return null;

        logger.debug(
          `Wrapping CJS: ${info.extractedModule.pkg}@${info.version} (format: ${outputFormat})`,
        );

        // Use format-aware wrapper
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

      buildEnd() {
        const cjsCount = [...moduleInfoCache.values()].filter(
          (d) => d.shouldWrap && !d.info.isESM,
        ).length;
        const esmCount = esmProxyInfoByProxyId.size;
        if (cjsCount > 0 || esmCount > 0) {
          logger.info(`Instrumented ${cjsCount} CJS + ${esmCount} ESM modules`);
        }
        if (wrappedEntries.size > 0) {
          logger.info(`Wrapped ${wrappedEntries.size} entry points`);
        }
      },

      esbuild: createEsbuildConfig({
        autoInit,
        logger,
        setOutputFormat: (format) => {
          outputFormat = format;
        },
        setAutoInitHandledByBanner: (handled) => {
          autoInitHandledByBanner = handled;
        },
      }),

      rollup: createRollupConfig({
        logger,
        setOutputFormat: (format: "cjs" | "esm") => {
          outputFormat = format;
        },
        setUsesRenderChunkWrapperConversion: (uses: boolean) => {
          usesRenderChunkWrapperConversion = uses;
        },
      }),

      rolldown: createRolldownConfig({
        logger,
        setOutputFormat: (format: "cjs" | "esm") => {
          outputFormat = format;
        },
        setUsesRenderChunkWrapperConversion: (uses: boolean) => {
          usesRenderChunkWrapperConversion = uses;
        },
      }),

      webpack: createWebpackConfig({
        logger,
      }),

      rspack: createRspackConfig({
        logger,
      }),

      vite: createViteConfig({
        autoInit,
        debug,
        logger,
        require,
      }),
    };
  });

// Named exports for entry files
export { unpluginDatadogApm as DatadogAPM };
