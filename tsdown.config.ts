import type { TsdownOptions } from "tsdown";

/**
 * Explicit entrypoints for the unplugin-datadog-apm package.
 * Keys map directly to export paths (e.g., "api" -> "./api").
 */
const config: TsdownOptions = {
  entry: {
    index: "src/index.ts",
    api: "src/api.ts",
    esbuild: "src/esbuild.ts",
    init: "src/init.ts",
    register: "src/register.ts",
    "register-helpers": "src/register-helpers.ts",
    rolldown: "src/rolldown.ts",
    rollup: "src/rollup.ts",
    rspack: "src/rspack.ts",
    vite: "src/vite.ts",
    webpack: "src/webpack.ts",
  },
  platform: "node",
};

export default config;
