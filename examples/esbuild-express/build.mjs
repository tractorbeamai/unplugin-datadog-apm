import * as esbuild from "esbuild";
import DatadogAPM from "unplugin-datadog-apm/esbuild";

await esbuild.build({
  entryPoints: ["src/server.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/server.mjs",
  plugins: [DatadogAPM()],
  // Note: dd-trace and @opentelemetry/api are auto-externalized by the plugin
});

console.log("Build complete: dist/server.mjs");
