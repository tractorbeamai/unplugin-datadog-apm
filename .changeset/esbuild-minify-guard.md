---
"unplugin-datadog-apm": patch
---

Add safety guard for esbuild builds using --minify without --keep-names. This configuration breaks dd-trace instrumentation, so the plugin now throws an error with a clear message instead of producing a silently broken bundle.
