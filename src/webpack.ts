/**
 * This entry file is for webpack plugin.
 *
 * @module
 */

import { ROLLUP_EXTERNALS } from "./core/constants";
import { DatadogAPM } from "./index";

/**
 * Webpack plugin with externals list.
 */
type WebpackPlugin = typeof DatadogAPM.webpack & {
  /**
   * List of modules that should be externalized for dd-trace compatibility.
   * Includes RegExp patterns for subpath imports.
   */
  externals: (string | RegExp)[];
};

/**
 * Webpack plugin for Datadog APM.
 *
 * @example
 * ```js
 * // webpack.config.js
 * import DatadogAPM from 'unplugin-datadog-apm/webpack'
 *
 * export default {
 *   plugins: [DatadogAPM()],
 *   externals: DatadogAPM.externals,
 * }
 * ```
 */
const webpack = DatadogAPM.webpack as WebpackPlugin;
webpack.externals = ROLLUP_EXTERNALS;

export default webpack;
