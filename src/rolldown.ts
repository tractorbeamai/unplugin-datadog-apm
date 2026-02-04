/**
 * This entry file is for Rolldown plugin.
 *
 * @module
 */

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
const rolldown: typeof DatadogAPM.rolldown = DatadogAPM.rolldown;
export default rolldown;
