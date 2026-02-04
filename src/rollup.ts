/**
 * This entry file is for Rollup plugin.
 *
 * @module
 */

import { ROLLUP_EXTERNALS } from "./core/constants";
import { DatadogAPM } from "./index";

/**
 * Rollup plugin with externals list.
 */
type RollupPlugin = typeof DatadogAPM.rollup & {
  /**
   * List of modules that should be externalized for dd-trace compatibility.
   * Includes RegExp patterns for subpath imports.
   */
  externals: (string | RegExp)[];
};

/**
 * Rollup plugin for Datadog APM.
 *
 * @example
 * ```ts
 * // rollup.config.js
 * import DatadogAPM from 'unplugin-datadog-apm/rollup'
 *
 * export default {
 *   plugins: [DatadogAPM()],
 *   external: DatadogAPM.externals,
 * }
 * ```
 */
const rollup = DatadogAPM.rollup as RollupPlugin;
rollup.externals = ROLLUP_EXTERNALS;

export default rollup;
