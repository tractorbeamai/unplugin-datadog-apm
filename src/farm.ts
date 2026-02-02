/**
 * This entry file is for Farm plugin.
 *
 * @module
 */

import { DatadogAPM } from "./index";

/**
 * Farm plugin
 *
 * @example
 * ```ts
 * // farm.config.js
 * import DatadogAPM from 'unplugin-datadog-apm/farm'
 *
 * export default {
 *   plugins: [DatadogAPM()],
 * }
 * ```
 */
const farm: typeof DatadogAPM.farm = DatadogAPM.farm;
export default farm;
export { farm as "module.exports" };
