/**
 * This entry file is for Rolldown plugin.
 *
 * @module
 */

import { ROLLUP_EXTERNALS } from "./core/constants";
import { DatadogAPM } from "./index";

/**
 * Rolldown plugin with externals list.
 */
type RolldownPlugin = typeof DatadogAPM.rolldown & {
  /**
   * List of modules that should be externalized for dd-trace compatibility.
   * Includes RegExp patterns for subpath imports.
   */
  externals: (string | RegExp)[];
};

/**
 * Rolldown plugin for Datadog APM.
 *
 * @example
 * ```ts
 * // rolldown.config.js
 * import DatadogAPM from 'unplugin-datadog-apm/rolldown'
 *
 * export default {
 *   plugins: [DatadogAPM()],
 *   external: DatadogAPM.externals,
 * }
 * ```
 */
const rolldown = DatadogAPM.rolldown as RolldownPlugin;
rolldown.externals = ROLLUP_EXTERNALS;

export default rolldown;
