import type { ConsolaInstance } from "consola";

import { ROLLUP_EXTERNALS } from "../core/constants";
import { convertCJSWrapperToESM } from "../core/convert-cjs-wrapper";
import { mergeExternals } from "../core/externals";

interface RollupConfig {
  options?: (options: { external?: unknown }) => void;
  outputOptions?: (options: { format?: string }) => void;
  renderChunk?: (
    code: string,
    _chunk: unknown,
    options: { format?: string },
  ) => { code: string; map: null } | null;
}

interface RollupConfigOptions {
  logger: ConsolaInstance;
  setOutputFormat: (format: "cjs" | "esm") => void;
  setUsesRenderChunkWrapperConversion: (uses: boolean) => void;
}

export function createRollupConfig({
  logger,
  setOutputFormat,
  setUsesRenderChunkWrapperConversion,
}: RollupConfigOptions): RollupConfig {
  return {
    options(options) {
      setUsesRenderChunkWrapperConversion(true);
      options.external = mergeExternals(options.external, ROLLUP_EXTERNALS);
      logger.debug("Added rollup externals for dd-trace");
    },
    outputOptions(options) {
      const format =
        options.format === "es" || options.format === "esm" ? "esm" : "cjs";
      setOutputFormat(format);
      logger.debug(`rollup output format: ${format}`);
    },
    renderChunk(code, _chunk, options) {
      const format = options.format ?? "";
      if (format !== "es" && format !== "esm") return null;
      const converted = convertCJSWrapperToESM(code);
      return converted ? { code: converted, map: null } : null;
    },
  };
}
