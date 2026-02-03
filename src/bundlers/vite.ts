import type { ConsolaInstance } from "consola";

import { DD_TRACE_INIT_BANNER, ROLLUP_EXTERNALS } from "../core/constants";
import { getStringExternals } from "../core/externals";
import { initTracer } from "../core/init-tracer";

interface ViteHook {
  config?: (
    config: unknown,
    env: { command: string },
  ) => Record<string, unknown>;
}

interface ViteConfigOptions {
  autoInit: boolean;
  debug: boolean;
  logger: ConsolaInstance;
  require: NodeJS.Require;
}

/**
 * Create Vite configuration hooks for dd-trace integration.
 *
 * @param options - Runtime options and logger.
 */
export function createViteConfig({
  autoInit,
  debug,
  logger,
  require,
}: ViteConfigOptions): ViteHook {
  return {
    /**
     * Configure SSR externals and optional init at dev startup.
     */
    config(_config, env) {
      if (autoInit && env.command === "serve") {
        initTracer({
          require,
          debug,
          debugMessages: {
            init: "[unplugin-datadog-apm] dd-trace initialized",
            tracerProvider:
              "[unplugin-datadog-apm] TracerProvider registered with OTel API",
          },
        });
      }

      const initModulePath = require.resolve("unplugin-datadog-apm/init");
      const stringExternals = getStringExternals(ROLLUP_EXTERNALS);

      logger.debug("Configured Vite SSR externals for dd-trace");

      return {
        ssr: { external: stringExternals, noExternal: [] },
        build: { rollupOptions: { external: ROLLUP_EXTERNALS } },
        nitro: autoInit
          ? {
              unenv: { polyfill: [initModulePath] },
              rollupConfig: { output: { banner: DD_TRACE_INIT_BANNER } },
            }
          : undefined,
      } as Record<string, unknown>;
    },
  };
}
