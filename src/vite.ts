/**
 * Vite plugin for Datadog APM instrumentation.
 *
 * @module
 */

import { STRING_ONLY_EXTERNALS } from "./core/constants";
import { DatadogAPM } from "./index";

/**
 * Vite plugin with externals list.
 */
type VitePlugin = typeof DatadogAPM.vite & {
  /**
   * List of modules that should be externalized for dd-trace compatibility.
   * Use in ssr.external and build.rollupOptions.external.
   */
  externals: readonly string[];
};

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
 *   ssr: { external: DatadogAPM.externals },
 *   build: { rollupOptions: { external: DatadogAPM.externals } },
 * })
 * ```
 */
const vite = DatadogAPM.vite as VitePlugin;
vite.externals = STRING_ONLY_EXTERNALS;

export default vite;
