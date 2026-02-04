import { createWebpackLikeConfig } from "./webpack-like";

interface WebpackCompiler {
  options: { externals?: unknown };
}

type WebpackHook = (compiler: WebpackCompiler) => void;

/**
 * Create webpack configuration hooks for dd-trace integration.
 *
 * Externals are no longer auto-injected. Use `DatadogAPM.externals` to get
 * the list of modules that should be externalized.
 */
export function createWebpackConfig(): WebpackHook {
  return createWebpackLikeConfig({ bundlerName: "webpack" });
}
