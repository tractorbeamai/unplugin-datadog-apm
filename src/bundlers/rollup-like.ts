import type { ConsolaInstance } from "consola";

import { convertCJSWrapperToESM } from "../core/convert-cjs-wrapper";
import { isEsmFormat } from "../core/format";

export interface RollupLikeConfig {
  options?: () => void;
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
 * Create configuration hooks shared by rollup-like bundlers.
 *
 * Externals are no longer auto-injected. Use `DatadogAPM.externals` to get
 * the list of modules that should be externalized and add them to your
 * bundler config manually.
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
     * Initialize rollup-like bundler hooks.
     */
    options() {
      setUsesRenderChunkWrapperConversion(true);
    },
    // Rollup uses outputOptions hook to detect format, rolldown detects in renderChunk
    outputOptions: bundlerName === "rollup" ? handleOutputOptions : undefined,
    /**
     * Convert CJS wrapper output when bundling to ESM.
     *
     * @param code - Chunk code to transform.
     * @param _chunk - Rollup chunk metadata.
     * @param options - Render options with format.
     * @returns Transformed chunk or null when unchanged.
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
