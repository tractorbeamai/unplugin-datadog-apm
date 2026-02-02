/**
 * This entry file is for esbuild plugin.
 *
 * @module
 */

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
const esbuild: typeof DatadogAPM.esbuild = DatadogAPM.esbuild;
export default esbuild;
export { esbuild as "module.exports" };
