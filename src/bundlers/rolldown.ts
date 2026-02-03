import type { ConsolaInstance } from "consola";

import { ROLLUP_EXTERNALS } from "../core/constants";
import { convertCJSWrapperToESM } from "../core/convert-cjs-wrapper";
import { mergeExternals } from "../core/externals";

interface RolldownConfig {
  options?: (options: { external?: unknown }) => void;
  renderChunk?: (
    code: string,
    _chunk: unknown,
    options: { format?: string },
  ) => { code: string; map: null } | null;
}

interface RolldownConfigOptions {
  logger: ConsolaInstance;
  setOutputFormat: (format: "cjs" | "esm") => void;
  setUsesRenderChunkWrapperConversion: (uses: boolean) => void;
}

export function createRolldownConfig({
  logger,
  setOutputFormat,
  setUsesRenderChunkWrapperConversion,
}: RolldownConfigOptions): RolldownConfig {
  return {
    options(options) {
      setUsesRenderChunkWrapperConversion(true);
      options.external = mergeExternals(options.external, ROLLUP_EXTERNALS);
      logger.debug("Added rolldown externals for dd-trace");
    },
    renderChunk(code, _chunk, options) {
      const format = options.format ?? "";
      if (format === "esm" || format === "es") setOutputFormat("esm");
      if (format !== "esm" && format !== "es") return null;
      const converted = convertCJSWrapperToESM(code);
      return converted ? { code: converted, map: null } : null;
    },
  };
}
