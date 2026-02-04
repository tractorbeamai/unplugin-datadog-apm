import type { ConsolaInstance } from "consola";

/**
 * Vite hook configuration type.
 */
export type ViteHook = Record<string, never>;

interface ViteConfigOptions {
  debug: boolean;
  logger: ConsolaInstance;
}

/**
 * Create Vite configuration hooks for dd-trace integration.
 *
 * Externals are no longer auto-injected. Use `DatadogAPM.externals` to get
 * the list of modules that should be externalized and add them to your
 * Vite config manually.
 *
 * @param _options - Runtime options (unused after externals removal).
 * @returns Empty hook object.
 */
export function createViteConfig(_options: ViteConfigOptions): ViteHook {
  return {};
}
