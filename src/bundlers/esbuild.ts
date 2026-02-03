import type { ConsolaInstance } from "consola";

import { generateCJSInitBanner, generateESMInitBanner } from "../core/banner";
import { ESBUILD_EXTERNALS } from "../core/constants";

interface EsbuildConfigOptions {
  format?: string;
  external?: string[] | string;
  banner?: { js?: string };
}

interface EsbuildConfig {
  config?: (options: EsbuildConfigOptions) => void;
}

interface EsbuildConfigParams {
  autoInit: boolean;
  logger: ConsolaInstance;
  setOutputFormat: (format: "cjs" | "esm") => void;
  setAutoInitHandledByBanner: (handled: boolean) => void;
}

export function createEsbuildConfig({
  autoInit,
  logger,
  setOutputFormat,
  setAutoInitHandledByBanner,
}: EsbuildConfigParams): EsbuildConfig {
  return {
    config(options) {
      const format = options.format === "esm" ? "esm" : "cjs";
      setOutputFormat(format);
      logger.debug(`esbuild output format: ${format}`);

      const existingExternals = options.external ?? [];
      const externalsArray = Array.isArray(existingExternals)
        ? existingExternals
        : [existingExternals];
      options.external = [
        ...new Set([...externalsArray, ...ESBUILD_EXTERNALS]),
      ];

      const existingBanner = options.banner?.js ?? "";
      const isESM = options.format === "esm";

      if (isESM) {
        const banner = generateESMInitBanner(autoInit);
        options.banner = {
          ...options.banner,
          js: `${banner}\n${existingBanner}`,
        };
        if (autoInit) setAutoInitHandledByBanner(true);
      } else if (autoInit) {
        options.banner = {
          ...options.banner,
          js: `${generateCJSInitBanner()}\n${existingBanner}`,
        };
        setAutoInitHandledByBanner(true);
      }
    },
  };
}
