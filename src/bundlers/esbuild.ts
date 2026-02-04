import type { ConsolaInstance } from "consola";

import { generateGitMetadataBanner } from "../core/banner";
import { isEsmFormat } from "../core/format";
import { getGitMetadata } from "../core/git";

interface EsbuildConfigOptions {
  format?: string;
  banner?: { js?: string };
  minify?: boolean;
  keepNames?: boolean;
}

interface EsbuildConfig {
  config?: (options: EsbuildConfigOptions) => void;
}

interface EsbuildConfigParams {
  logger: ConsolaInstance;
  setOutputFormat: (format: "cjs" | "esm") => void;
}

/**
 * Create the esbuild configuration hook for dd-trace integration.
 *
 * Externals are no longer auto-injected. Use `DatadogAPM.externals` to get
 * the list of modules that should be externalized and add them to your
 * esbuild config manually.
 *
 * @param params - Hook configuration and callbacks from the plugin.
 * @see https://github.com/DataDog/dd-trace-js/blob/master/packages/datadog-esbuild/index.js
 */
export function createEsbuildConfig({
  logger,
  setOutputFormat,
}: EsbuildConfigParams): EsbuildConfig {
  return {
    /**
     * Apply esbuild config mutations for git metadata.
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

      const format = isEsmFormat(options.format) ? "esm" : "cjs";
      setOutputFormat(format);
      logger.debug(`esbuild output format: ${format}`);

      // Inject git metadata for Datadog source code integration
      const gitMetadata = getGitMetadata();
      const gitBanner = generateGitMetadataBanner(gitMetadata);

      if (gitBanner) {
        const existingBanner = options.banner?.js ?? "";
        options.banner = {
          ...options.banner,
          js: existingBanner ? `${gitBanner}\n${existingBanner}` : gitBanner,
        };
      }
    },
  };
}
