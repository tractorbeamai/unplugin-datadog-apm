/**
 * Vite plugin for Datadog APM instrumentation.
 *
 * @module
 */

import { unpluginDatadogApm } from "./index";

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
const vite: typeof unpluginDatadogApm.vite = unpluginDatadogApm.vite;
export default vite;

export { vite as DatadogAPM };
export { vite as "module.exports" };

export { type Options } from "./core/options";
