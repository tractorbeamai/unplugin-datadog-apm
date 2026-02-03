/**
 * This entry file is for Rspack plugin.
 *
 * @module
 */

import { createBundlerEntry } from "./entrypoints/shared";
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
const rspack: typeof DatadogAPM.rspack = createBundlerEntry(DatadogAPM.rspack);
export default rspack;
export { rspack as "module.exports" };
