import type { ConsolaInstance } from "consola";

import { ROLLUP_EXTERNALS } from "../core/constants";
import { convertCJSWrapperToESM } from "../core/convert-cjs-wrapper";
import { mergeExternals } from "../core/externals";

export interface RollupLikeConfig {
  options?: (options: { external?: unknown }) => void;
  outputOptions?: (options: { format?: string }) => void;
  renderChunk?: (
    code: string,
    _chunk: unknown,
    options: { format?: string },
  ) => { code: string; map: null } | null;
}

interface RollupLikeConfigOptions {
  logger: ConsolaInstance;
  bundlerName: "rollup" | "rolldown";
  setOutputFormat: (format: "cjs" | "esm") => void;
  setUsesRenderChunkWrapperConversion: (uses: boolean) => void;
}

/**
 * Normalize rollup format strings to an ESM flag.
 *
 * @param format - Rollup output format string.
 */
function isEsmFormat(format: string | undefined): boolean {
  return format === "es" || format === "esm";
}

/**
 * Create configuration hooks shared by rollup-like bundlers.
 *
 * @param options - Logger and callbacks for output format handling.
 */
export function createRollupLikeConfig({
  logger,
  bundlerName,
  setOutputFormat,
  setUsesRenderChunkWrapperConversion,
}: RollupLikeConfigOptions): RollupLikeConfig {
  /**
   * Handle rollup output options to detect the final format.
   *
   * @param options - Rollup output options object.
   */
  function handleOutputOptions(options: { format?: string }): void {
    const format = isEsmFormat(options.format) ? "esm" : "cjs";
    setOutputFormat(format);
    logger.debug(`${bundlerName} output format: ${format}`);
  }

  return {
    /**
     * Inject dd-trace externals into the bundler options.
     */
    options(options) {
      setUsesRenderChunkWrapperConversion(true);
      options.external = mergeExternals(options.external, ROLLUP_EXTERNALS);
      logger.debug(`Added ${bundlerName} externals for dd-trace`);
    },
    // Rollup uses outputOptions hook to detect format, rolldown detects in renderChunk
    outputOptions: bundlerName === "rollup" ? handleOutputOptions : undefined,
    /**
     * Convert CJS wrapper output when bundling to ESM.
     */
    renderChunk(code, _chunk, options) {
      const format = options.format ?? "";
      // Rolldown detects format in renderChunk since it doesn't have outputOptions
      if (bundlerName === "rolldown" && isEsmFormat(format)) {
        setOutputFormat("esm");
      }
      if (!isEsmFormat(format)) return null;
      const converted = convertCJSWrapperToESM(code);
      return converted ? { code: converted, map: null } : null;
    },
  };
}
