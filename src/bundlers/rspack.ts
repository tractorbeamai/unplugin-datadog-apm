import type { ConsolaInstance } from "consola";

import { createWebpackLikeConfig } from "./webpack-like";

interface RspackCompiler {
  options: { externals?: unknown };
}

type RspackHook = (compiler: RspackCompiler) => void;

interface RspackConfigOptions {
  logger: ConsolaInstance;
}

/**
 * Create rspack configuration hooks for dd-trace integration.
 *
 * @param options - Logger for diagnostics.
 */
export function createRspackConfig({
  logger,
}: RspackConfigOptions): RspackHook {
  return createWebpackLikeConfig({ logger, bundlerName: "rspack" });
}
