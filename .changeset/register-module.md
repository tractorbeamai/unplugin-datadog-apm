---
"unplugin-datadog-apm": minor
---

Add `unplugin-datadog-apm/register` entrypoint for use with Node.js `--import` flag. This enables zero-config APM by running `node --import unplugin-datadog-apm/register ./app.js`. Also adds `unplugin-datadog-apm/register-helpers` exporting `setupTracer` and `registerLoaderHook` for custom register files with advanced tracer configuration.
