/**
 * This entry file is for Rspack plugin.
 *
 * @module
 */

import { ROLLUP_EXTERNALS } from "./core/constants";
import { DatadogAPM } from "./index";

/**
 * Rspack plugin with externals list.
 */
type RspackPlugin = typeof DatadogAPM.rspack & {
  /**
   * List of modules that should be externalized for dd-trace compatibility.
   * Includes RegExp patterns for subpath imports.
   */
  externals: (string | RegExp)[];
};

/**
 * Rspack plugin for Datadog APM.
 *
 * @example
 * ```js
 * // rspack.config.js
 * import DatadogAPM from 'unplugin-datadog-apm/rspack'
 *
 * export default {
 *   plugins: [DatadogAPM()],
 *   externals: DatadogAPM.externals,
 * }
 * ```
 */
const rspack = DatadogAPM.rspack as RspackPlugin;
rspack.externals = ROLLUP_EXTERNALS;

export default rspack;
