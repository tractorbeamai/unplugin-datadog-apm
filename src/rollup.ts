/**
 * This entry file is for Rollup plugin.
 *
 * @module
 */

import { createBundlerEntry } from "./entrypoints/shared";
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
const rollup: typeof DatadogAPM.rollup = createBundlerEntry(DatadogAPM.rollup);
export default rollup;
export { rollup as "module.exports" };
