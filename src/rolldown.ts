/**
 * This entry file is for Rolldown plugin.
 *
 * @module
 */

import { createBundlerEntry } from "./entrypoints/shared";
import { DatadogAPM } from "./index";

/**
 * Rolldown plugin
 *
 * @example
 * ```ts
 * // rolldown.config.js
 * import DatadogAPM from 'unplugin-datadog-apm/rolldown'
 *
 * export default {
 *   plugins: [DatadogAPM()],
 * }
 * ```
 */
const rolldown: typeof DatadogAPM.rolldown = createBundlerEntry(
  DatadogAPM.rolldown,
);
export default rolldown;
export { rolldown as "module.exports" };
