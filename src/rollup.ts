/**
 * This entry file is for Rollup plugin.
 *
 * @module
 */

import { DatadogAPM } from "./index";

/**
 * Rollup plugin
 *
 * @example
 * ```ts
 * // rollup.config.js
 * import DatadogAPM from 'unplugin-datadog-apm/rollup'
 *
 * export default {
 *   plugins: [DatadogAPM()],
 * }
 * ```
 */
const rollup: typeof DatadogAPM.rollup = DatadogAPM.rollup;
export default rollup;
