import type { ConsolaInstance } from "consola";

import { generateCJSInitBanner, generateESMInitBanner } from "../core/banner";
import { ESBUILD_EXTERNALS } from "../core/constants";
import { getGitMetadata } from "../core/git";

interface EsbuildConfigOptions {
  format?: string;
  external?: string[] | string;
  banner?: { js?: string };
  minify?: boolean;
  keepNames?: boolean;
}

interface EsbuildConfig {
  config?: (options: EsbuildConfigOptions) => void;
}

interface EsbuildConfigParams {
  autoInit: boolean;
  logger: ConsolaInstance;
  tracerOptionsCode: string;
  setOutputFormat: (format: "cjs" | "esm") => void;
  setAutoInitHandledByBanner: (handled: boolean) => void;
}

/**
 * Create the esbuild configuration hook for dd-trace integration.
 *
 * @param params - Hook configuration and callbacks from the plugin.
 * @see https://github.com/DataDog/dd-trace-js/blob/master/packages/datadog-esbuild/index.js
 */
export function createEsbuildConfig({
  autoInit,
  logger,
  tracerOptionsCode,
  setOutputFormat,
  setAutoInitHandledByBanner,
}: EsbuildConfigParams): EsbuildConfig {
  return {
    /**
     * Apply esbuild config mutations for externals and init banners.
     *
     * @param options - Esbuild options to mutate.
     * @see https://github.com/DataDog/dd-trace-js/blob/master/packages/datadog-esbuild/index.js
     */
    config(options) {
      // Mirrors dd-trace esbuild safety guard:
      // https://github.com/DataDog/dd-trace-js/blob/master/packages/datadog-esbuild/index.js
      if (options.minify && !options.keepNames) {
        throw new Error(
          "Using --minify without --keep-names will break some dd-trace behavior. Refusing to bundle.",
        );
      }

      const format = options.format === "esm" ? "esm" : "cjs";
      setOutputFormat(format);
      logger.debug(`esbuild output format: ${format}`);

      // Keep behavior aligned with dd-trace plugin:
      // https://github.com/DataDog/dd-trace-js/blob/master/packages/datadog-esbuild/index.js
      const existingExternals = options.external ?? [];
      const externalsArray = Array.isArray(existingExternals)
        ? existingExternals
        : [existingExternals];
      const externals = new Set([...externalsArray, ...ESBUILD_EXTERNALS]);
      options.external = [...externals];

      const existingBanner = options.banner?.js ?? "";
      const gitMetadata = getGitMetadata();
      const isESM = options.format === "esm";

      if (isESM) {
        const banner = generateESMInitBanner(
          autoInit,
          gitMetadata,
          tracerOptionsCode,
        );
        options.banner = {
          ...options.banner,
          js: `${banner}\n${existingBanner}`,
        };
        if (autoInit) setAutoInitHandledByBanner(true);
      } else {
        const banner = generateCJSInitBanner(
          autoInit,
          gitMetadata,
          tracerOptionsCode,
        );
        if (banner) {
          options.banner = {
            ...options.banner,
            js: `${banner}\n${existingBanner}`,
          };
        }
        if (autoInit) setAutoInitHandledByBanner(true);
      }
    },
  };
}
