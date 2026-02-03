import type { ConsolaInstance } from "consola";

import { ROLLUP_EXTERNALS } from "../core/constants";
import { appendExternals } from "../core/externals";

interface WebpackLikeCompiler {
  options: { externals?: unknown };
}

type WebpackLikeHook = (compiler: WebpackLikeCompiler) => void;

interface WebpackLikeConfigOptions {
  logger: ConsolaInstance;
  bundlerName: "webpack" | "rspack";
}

export function createWebpackLikeConfig({
  logger,
  bundlerName,
}: WebpackLikeConfigOptions): WebpackLikeHook {
  return (compiler) => {
    compiler.options.externals = appendExternals(
      compiler.options.externals,
      ROLLUP_EXTERNALS,
    );
    logger.debug(`Added ${bundlerName} externals for dd-trace`);
  };
}
