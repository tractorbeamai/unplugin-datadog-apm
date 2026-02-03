import type { ConsolaInstance } from "consola";

import { createWebpackLikeConfig } from "./webpack-like";

interface RspackCompiler {
  options: { externals?: unknown };
}

type RspackHook = (compiler: RspackCompiler) => void;

interface RspackConfigOptions {
  logger: ConsolaInstance;
}

export function createRspackConfig({
  logger,
}: RspackConfigOptions): RspackHook {
  return createWebpackLikeConfig({ logger, bundlerName: "rspack" });
}
