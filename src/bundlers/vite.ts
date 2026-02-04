import type { ConsolaInstance } from "consola";

import { ROLLUP_EXTERNALS, STRING_ONLY_EXTERNALS } from "../core/constants";

interface ViteHook {
  config?: (
    config: unknown,
    env: { command: string },
  ) => Record<string, unknown>;
}

interface ViteConfigOptions {
  debug: boolean;
  logger: ConsolaInstance;
}

/**
 * Check whether the current Vite build is producing an SSR/server bundle.
 *
 * Vite uses `build.ssr` (boolean or string entry) to indicate an SSR build.
 * We avoid setting `build.rollupOptions.external` for client builds because it
 * can externalize dependencies that the browser bundle cannot import.
 *
 * @param config - Incoming Vite config object.
 * @returns True when the build is an SSR build.
 */
function isViteSsrBuild(config: unknown): boolean {
  if (!config || typeof config !== "object") return false;
  const build = (config as { build?: { ssr?: boolean | string } }).build;
  return Boolean(build?.ssr);
}

/**
 * Create Vite configuration hooks for dd-trace integration.
 *
 * Configures SSR externals to ensure dd-trace and related packages
 * are not bundled. dd-trace initialization should be done via
 * --import unplugin-datadog-apm/register at runtime.
 *
 * @param options - Runtime options and logger.
 */
export function createViteConfig({ logger }: ViteConfigOptions): ViteHook {
  return {
    /**
     * Configure SSR externals for dd-trace.
     *
     * @param _config - Existing Vite config.
     * @returns Updated config overrides.
     */
    config(_config) {
      const ssrBuild = isViteSsrBuild(_config);

      logger.debug("Configured Vite SSR externals for dd-trace");

      return {
        ssr: { external: STRING_ONLY_EXTERNALS, noExternal: [] },
        // Only apply rollup externals when building the server bundle.
        // Client builds must not externalize server-only packages.
        build: ssrBuild
          ? { rollupOptions: { external: ROLLUP_EXTERNALS } }
          : {},
      } as Record<string, unknown>;
    },
  };
}
