import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

import DatadogAPM from "../../src/vite";

const externalPackages = [
  // Datadog - must be external to work at runtime
  "dd-trace",
  "@datadog/native-metrics",
  "@datadog/pprof",

  // Required for dd-trace instrumentation
  "dc-polyfill",
  "import-in-the-middle",

  // OpenTelemetry API must be external so app code uses the same instance
  "@opentelemetry/api",
];

export default defineConfig({
  resolve: {
    dedupe: externalPackages,
  },
  optimizeDeps: {
    exclude: externalPackages,
  },
  build: {
    rolldownOptions: {
      external: externalPackages,
    },
  },
  nitro: {
    preset: "node-server",
  },
  plugins: [
    // Datadog APM - automatically initializes dd-trace and wraps instrumentable modules
    // For Nitro builds, it configures the polyfill automatically
    DatadogAPM({
      debug: !!process.env.DD_TRACE_DEBUG,
    }),
    tanstackStart(),
    nitro(),
    viteReact(),
  ],
});
