import type { ConsolaInstance } from "consola";

import { createWebpackLikeConfig } from "./webpack-like";

interface WebpackCompiler {
  options: { externals?: unknown };
}

type WebpackHook = (compiler: WebpackCompiler) => void;

interface WebpackConfigOptions {
  logger: ConsolaInstance;
}

/**
 * Create webpack configuration hooks for dd-trace integration.
 *
 * @param options - Logger for diagnostics.
 */
export function createWebpackConfig({
  logger,
}: WebpackConfigOptions): WebpackHook {
  return createWebpackLikeConfig({ logger, bundlerName: "webpack" });
}
