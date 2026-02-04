import { createWebpackLikeConfig } from "./webpack-like";

interface RspackCompiler {
  options: { externals?: unknown };
}

type RspackHook = (compiler: RspackCompiler) => void;

/**
 * Create rspack configuration hooks for dd-trace integration.
 *
 * Externals are no longer auto-injected. Use `DatadogAPM.externals` to get
 * the list of modules that should be externalized.
 */
export function createRspackConfig(): RspackHook {
  return createWebpackLikeConfig({ bundlerName: "rspack" });
}
