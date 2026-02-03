/**
 * This entry file is for webpack plugin.
 *
 * @module
 */

import { DatadogAPM } from "./index";

/**
 * Webpack plugin
 *
 * @example
 * ```js
 * // webpack.config.js
 * import DatadogAPM from 'unplugin-datadog-apm/webpack'
 *
 * export default {
 *   plugins: [DatadogAPM()],
 * }
 * ```
 */
const webpack: typeof DatadogAPM.webpack = DatadogAPM.webpack;
export default webpack;
export { webpack as "module.exports" };
