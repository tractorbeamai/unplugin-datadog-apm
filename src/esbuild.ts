/**
 * This entry file is for esbuild plugin.
 *
 * @module
 */

import { STRING_ONLY_EXTERNALS } from "./core/constants";
import { DatadogAPM } from "./index";

/**
 * Esbuild plugin with externals list.
 */
type EsbuildPlugin = typeof DatadogAPM.esbuild & {
  /**
   * List of modules that should be externalized for dd-trace compatibility.
   */
  externals: readonly string[];
};

/**
 * Esbuild plugin for Datadog APM.
 *
 * @example
 * ```ts
 * import { build } from 'esbuild'
 * import DatadogAPM from 'unplugin-datadog-apm/esbuild'
 *
 * build({
 *   plugins: [DatadogAPM()],
 *   external: DatadogAPM.externals,
 * })
 * ```
 */
const esbuild = DatadogAPM.esbuild as EsbuildPlugin;
esbuild.externals = STRING_ONLY_EXTERNALS;

export default esbuild;
