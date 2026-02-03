import type { ConsolaInstance } from "consola";

import { createRollupLikeConfig, type RollupLikeConfig } from "./rollup-like";

interface RollupConfigOptions {
  logger: ConsolaInstance;
  setOutputFormat: (format: "cjs" | "esm") => void;
  setUsesRenderChunkWrapperConversion: (uses: boolean) => void;
}

/**
 * Create Rollup configuration hooks for dd-trace integration.
 *
 * @param options - Logger and callbacks for output format handling.
 */
export function createRollupConfig({
  logger,
  setOutputFormat,
  setUsesRenderChunkWrapperConversion,
}: RollupConfigOptions): RollupLikeConfig {
  return createRollupLikeConfig({
    logger,
    bundlerName: "rollup",
    setOutputFormat,
    setUsesRenderChunkWrapperConversion,
  });
}
