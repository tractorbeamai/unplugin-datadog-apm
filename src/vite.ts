/**
 * Vite plugin for Datadog APM instrumentation.
 *
 * @module
 */

import { DatadogAPM } from "./index";

/**
 * Vite plugin for Datadog APM.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import DatadogAPM from 'unplugin-datadog-apm/vite'
 *
 * export default defineConfig({
 *   plugins: [DatadogAPM()],
 * })
 * ```
 */
const vite: typeof DatadogAPM.vite = DatadogAPM.vite;
export default vite;
