---
"unplugin-datadog-apm": minor
---

Rename register helper functions for clarity

- `setupTracer` is now `setupOpenTelemetry` - better describes what the function does (registers TracerProvider with the OpenTelemetry API)
- `registerLoaderHook` is now `setupESMImports` - better describes what the function does (enables dd-trace to instrument ESM modules)

The old function names are preserved as deprecated aliases for backwards compatibility and will be removed in a future major version.
