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

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { builtinModules, createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parse, type Node } from "acorn";
import { createConsola } from "consola";
import { resolveModulePath } from "exsolve";
import { createUnplugin, type UnpluginInstance } from "unplugin";

import { resolveOptions, type Options } from "./core/options";

/** Rollup banner for production builds - imports the init module first */
const DD_TRACE_INIT_BANNER = `
// Auto-injected by unplugin-datadog-apm
import 'unplugin-datadog-apm/init';
`;

const logger = createConsola({ level: -1 }).withTag("datadog");

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface ExtractedModule {
  pkg: string;
  path: string;
  pkgJson: string;
}

interface ModuleInfo {
  extractedModule: ExtractedModule;
  version: string;
  fullPath: string;
  isESM: boolean;
  isBuiltin: boolean;
  rawImportPath: string;
}

interface PluginData {
  info: ModuleInfo;
  shouldWrap: boolean;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const NODE_MODULES = "node_modules/";
const CHANNEL = "dd-trace:bundler:load";
const ESM_SUFFIX = ".__dd_esm_proxy__";
const ENTRY_WRAPPER_PREFIX = "\0dd-entry:";
const INIT_MODULE = "unplugin-datadog-apm/init";

// Built-in modules
const BUILTINS = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));

// -----------------------------------------------------------------------------
// dd-trace Integration
// -----------------------------------------------------------------------------

// Use createRequire for loading dd-trace internals (CommonJS)
const require = createRequire(import.meta.url);

// Load hooks list (module names dd-trace can instrument)
const ddTraceHooks = new Set(
  Object.keys(
    require("dd-trace/packages/datadog-instrumentations/src/helpers/hooks") as Record<
      string,
      unknown
    >,
  ),
);

// Load package extraction utility from dd-trace
const ddTraceExtractPackageAndModulePath =
  require("dd-trace/packages/datadog-instrumentations/src/helpers/extract-package-and-module-path") as (
    fullPath: string,
  ) => { pkg: string | null; path: string; pkgJson: string };

// Load ESM detection utility from dd-trace
const { isESMFile: ddTraceIsESMFile } =
  require("dd-trace/packages/datadog-esbuild/src/utils") as {
    isESMFile: (
      path: string,
      pkgJsonPath?: string,
      pkgJson?: { type?: string },
    ) => boolean;
  };

// -----------------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------------

/**
 * Extract package name and path from a full module path.
 */
function extractPackageAndModulePath(fullPath: string): ExtractedModule | null {
  const result = ddTraceExtractPackageAndModulePath(fullPath);
  if (!result.pkg) return null;
  return result as ExtractedModule;
}

/**
 * Resolve a module path from a given directory.
 * Uses exsolve (ESM resolution with caching) with fallback to createRequire (CJS resolution)
 * for legacy packages without proper exports field.
 */
function resolveModule(modulePath: string, resolveDir: string): string {
  // Try exsolve first with CJS-preferred conditions (handles exports field, cached)
  const fromPath = resolveDir.endsWith("/") ? resolveDir : `${resolveDir}/`;
  const resolved = resolveModulePath(modulePath, {
    from: fromPath,
    conditions: ["node", "require", "import"], // Prefer CJS over ESM for conditional exports
    try: true, // Return undefined instead of throwing
  });

  if (resolved) {
    return resolved;
  }

  // Fall back to createRequire for legacy packages without exports field
  let resolvedPath = modulePath;
  if (modulePath === ".") resolvedPath = "./";
  else if (modulePath === "..") resolvedPath = "../";

  const req = createRequire(path.join(resolveDir, "package.json"));
  return req.resolve(resolvedPath);
}

function getGitMetadata(): { repositoryURL?: string; commitSHA?: string } {
  const result: { repositoryURL?: string; commitSHA?: string } = {};

  try {
    result.repositoryURL = execSync("git config --get remote.origin.url", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    // Git not available
  }

  try {
    result.commitSHA = execSync("git rev-parse HEAD", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    // Git not available
  }

  return result;
}

// -----------------------------------------------------------------------------
// Export Analysis (for ESM proxy generation)
// -----------------------------------------------------------------------------

/**
 * Extract names from a binding pattern (handles destructuring).
 * Supports Identifier, ObjectPattern, ArrayPattern, RestElement, and AssignmentPattern.
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
 * Handles VariableDeclaration, FunctionDeclaration, and ClassDeclaration.
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
 * Parse a module to extract its export names using AST parsing.
 * Uses Acorn to properly handle all export patterns including destructuring.
 */
function parseExportsFromSource(code: string): string[] {
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
 * Generate ESM proxy module code that registers with import-in-the-middle.
 */
function generateESMProxy(
  originalPath: string,
  rawImportPath: string,
  exportNames: string[],
  isBuiltin: boolean,
): string {
  const moduleUrl = isBuiltin
    ? rawImportPath
    : pathToFileURL(originalPath).href;
  const importPath = isBuiltin ? rawImportPath : originalPath;

  // Filter out star exports for the setter generation
  const namedExports = exportNames.filter((n) => !n.startsWith("* from "));
  const starExports = exportNames
    .filter((n) => n.startsWith("* from "))
    .map((n) => n.slice(7)); // Remove "* from " prefix

  // Generate setter code for each export
  const setterCode = namedExports
    .map((name) => {
      const safeName = `$${name.replaceAll(/[^\w$]/g, "_")}`;
      const key = JSON.stringify(name);
      const exportAs = name === "default" ? "default" : key;

      return `
let ${safeName};
try {
  ${safeName} = _[${key}] = namespace[${key}];
} catch (err) {
  if (!(err instanceof ReferenceError)) throw err;
}
export { ${safeName} as ${exportAs} };
set[${key}] = (v) => { ${safeName} = v; return true; };
get[${key}] = () => ${safeName};`;
    })
    .join("\n");

  // Generate star export re-exports
  const starExportCode = starExports
    .map((mod) => `export * from ${JSON.stringify(mod)};`)
    .join("\n");

  return `
import { register } from 'import-in-the-middle/lib/register.js';
import * as namespace from ${JSON.stringify(importPath)};

const _ = Object.create(null, { [Symbol.toStringTag]: { value: 'Module' } });
const set = {};
const get = {};

${setterCode}
${starExportCode}

register(${JSON.stringify(moduleUrl)}, _, set, get, ${JSON.stringify(rawImportPath)});
`;
}

// -----------------------------------------------------------------------------
// Module Wrapping
// -----------------------------------------------------------------------------

/**
 * Wrap a CommonJS module to publish to the dd-trace bundler channel.
 */
function wrapCommonJSModule(
  originalCode: string,
  moduleInfo: { pkg: string; path: string; version: string },
): string {
  const pkgPath = moduleInfo.path
    ? `${moduleInfo.pkg}/${moduleInfo.path}`
    : moduleInfo.pkg;

  return `
(function() {
  ${originalCode}
})(...arguments);
{
  const dc = require('dc-polyfill');
  const ch = dc.channel('${CHANNEL}');
  const mod = module.exports;
  const payload = {
    module: mod,
    version: '${moduleInfo.version}',
    package: '${moduleInfo.pkg}',
    path: '${pkgPath}'
  };
  ch.publish(payload);
  module.exports = payload.module;
}
`;
}

/**
 * Generate wrapper code for an entry point that imports init first.
 */
function generateEntryWrapper(originalPath: string): string {
  // Read the original to detect its exports
  let hasDefault = false;

  try {
    const code = readFileSync(originalPath, "utf8");
    const exports = parseExportsFromSource(code);
    hasDefault = exports.includes("default");
  } catch {
    // If we can't parse, just re-export everything
  }

  const lines = [
    `// Auto-generated entry wrapper by unplugin-datadog-apm`,
    `import ${JSON.stringify(INIT_MODULE)};`,
    `export * from ${JSON.stringify(originalPath)};`,
  ];

  if (hasDefault) {
    lines.push(`export { default } from ${JSON.stringify(originalPath)};`);
  }

  return lines.join("\n");
}

// -----------------------------------------------------------------------------
// Plugin Export
// -----------------------------------------------------------------------------

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

    // Track ESM modules that need proxy generation
    const esmProxyNeeded = new Map<string, ModuleInfo>();

    // Track wrapped entry points (original path -> true)
    const wrappedEntries = new Set<string>();

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

        // Check if this is an entry point we should wrap (using bundler's isEntry flag)
        const isEntry = resolveOptions.isEntry;

        if (autoInit && isEntry) {
          // Resolve the actual path for the entry
          let resolvedPath: string;
          try {
            if (path.isAbsolute(importee)) {
              resolvedPath = importee;
            } else if (importee.startsWith(".")) {
              resolvedPath = path.resolve(
                importer ? path.dirname(importer) : process.cwd(),
                importee,
              );
            } else {
              // Bare specifier - resolve it
              try {
                resolvedPath = resolveModule(
                  importee,
                  importer ? path.dirname(importer) : process.cwd(),
                );
              } catch {
                // Can't resolve, skip wrapping
                return null;
              }
            }
          } catch {
            return null;
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
        if (importee.endsWith(ESM_SUFFIX)) {
          return { id: importee };
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
        const baseModule = importee.startsWith("@")
          ? importee.split("/").slice(0, 2).join("/")
          : (importee.split("/")[0] ?? importee);

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

        const isESM = ddTraceIsESMFile(
          fullPath,
          extracted.pkgJson,
          packageJson,
        );

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

        // For ESM, redirect to proxy module
        if (isESM) {
          const proxyId = fullPath + ESM_SUFFIX;
          esmProxyNeeded.set(proxyId, info);
          moduleInfoCache.set(proxyId, { info, shouldWrap: true });
          return proxyId;
        }

        // For CJS, we'll transform in the transform hook
        moduleInfoCache.set(fullPath, { info, shouldWrap: true });
        return fullPath;
      },

      loadInclude(id) {
        return id.endsWith(ESM_SUFFIX) || id.startsWith(ENTRY_WRAPPER_PREFIX);
      },

      load(id) {
        // Handle entry wrapper virtual modules
        if (id.startsWith(ENTRY_WRAPPER_PREFIX)) {
          const originalPath = id.slice(ENTRY_WRAPPER_PREFIX.length);
          logger.debug(`Generating entry wrapper for: ${originalPath}`);
          return generateEntryWrapper(originalPath);
        }

        // Handle ESM proxy modules
        if (!id.endsWith(ESM_SUFFIX)) return null;

        const info = esmProxyNeeded.get(id);
        if (!info) return null;

        const originalPath = id.slice(0, -ESM_SUFFIX.length);

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
          `Wrapping CJS: ${info.extractedModule.pkg}@${info.version}`,
        );

        const wrapped = wrapCommonJSModule(code, {
          pkg: info.extractedModule.pkg,
          path: info.extractedModule.path,
          version: info.version,
        });

        return { code: wrapped, map: null };
      },

      buildEnd() {
        const cjsCount = [...moduleInfoCache.values()].filter(
          (d) => d.shouldWrap && !d.info.isESM,
        ).length;
        const esmCount = esmProxyNeeded.size;
        if (cjsCount > 0 || esmCount > 0) {
          logger.info(`Instrumented ${cjsCount} CJS + ${esmCount} ESM modules`);
        }
        if (wrappedEntries.size > 0) {
          logger.info(`Wrapped ${wrappedEntries.size} entry points`);
        }
      },

      // Vite-specific hooks for Nitro/SSR integration
      // These are merged with the base plugin when using unplugin.vite()
      vite: {
        config(config, env) {
          if (!autoInit) return;

          // Dev mode: initialize dd-trace early in Vite server process
          // This works for frameworks where SSR runs in the same process (SvelteKit, Remix)
          if (env.command === "serve") {
            const tracer = require("dd-trace");
            tracer.init();
            if (debug) {
              console.log("[unplugin-datadog-apm] dd-trace initialized");
            }
            const tracerProvider = new tracer.TracerProvider();
            tracerProvider.register();
            if (debug) {
              console.log(
                "[unplugin-datadog-apm] TracerProvider registered with OTel API",
              );
            }
          }

          // Resolve paths for Nitro integration
          const initModulePath = require.resolve("unplugin-datadog-apm/init");

          return {
            nitro: {
              // Add dd-trace init to polyfills - runs before ANY other imports in the worker
              unenv: {
                polyfill: [initModulePath],
              },
              // Production builds: rollup banner ensures dd-trace loads first
              rollupConfig: {
                output: {
                  banner: DD_TRACE_INIT_BANNER,
                },
              },
            },
          };
        },
      },
    };
  });

// Named exports for entry files
export { unpluginDatadogApm as DatadogAPM };
