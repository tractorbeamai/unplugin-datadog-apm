/**
 * This entry file is for Rspack plugin.
 *
 * @module
 */

import { DatadogAPM } from "./index";

/**
 * Rspack plugin
 *
 * @example
 * ```js
 * // rspack.config.js
 * import DatadogAPM from 'unplugin-datadog-apm/rspack'
 *
 * export default {
 *   plugins: [DatadogAPM()],
 * }
 * ```
 */
const rspack: typeof DatadogAPM.rspack = DatadogAPM.rspack;
export default rspack;
export { rspack as "module.exports" };
