import type { ConsolaInstance } from "consola";

import { createWebpackLikeConfig } from "./webpack-like";

interface WebpackCompiler {
  options: { externals?: unknown };
}

type WebpackHook = (compiler: WebpackCompiler) => void;

interface WebpackConfigOptions {
  logger: ConsolaInstance;
}

export function createWebpackConfig({
  logger,
}: WebpackConfigOptions): WebpackHook {
  return createWebpackLikeConfig({ logger, bundlerName: "webpack" });
}
