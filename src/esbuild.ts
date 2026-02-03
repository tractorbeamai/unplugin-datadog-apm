/**
 * This entry file is for esbuild plugin.
 *
 * @module
 */

import { createBundlerEntry } from "./entrypoints/shared";
import { DatadogAPM } from "./index";

/**
 * Esbuild plugin
 *
 * @example
 * ```ts
 * import { build } from 'esbuild'
 * import DatadogAPM from 'unplugin-datadog-apm/esbuild'
 * 
 * build({ plugins: [DatadogAPM()] })
```
 */
const esbuild: typeof DatadogAPM.esbuild = createBundlerEntry(
  DatadogAPM.esbuild,
);
export default esbuild;
export { esbuild as "module.exports" };
