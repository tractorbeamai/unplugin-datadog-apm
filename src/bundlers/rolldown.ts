import type { ConsolaInstance } from "consola";

import { createRollupLikeConfig, type RollupLikeConfig } from "./rollup-like";

interface RolldownConfigOptions {
  logger: ConsolaInstance;
  setOutputFormat: (format: "cjs" | "esm") => void;
  setUsesRenderChunkWrapperConversion: (uses: boolean) => void;
}

/**
 * Create Rolldown configuration hooks for dd-trace integration.
 *
 * @param options - Logger and callbacks for output format handling.
 */
export function createRolldownConfig({
  logger,
  setOutputFormat,
  setUsesRenderChunkWrapperConversion,
}: RolldownConfigOptions): RollupLikeConfig {
  return createRollupLikeConfig({
    logger,
    bundlerName: "rolldown",
    setOutputFormat,
    setUsesRenderChunkWrapperConversion,
  });
}
