---
"unplugin-datadog-apm": patch
---

Fix Nitro externals plugin adding trailing slash to ESM proxy imports

When ESM proxy modules import their target packages (e.g., `pg`, `ai`), Nitro's externals plugin was rewriting bare specifiers like `"pg"` to `"pg/"`. This caused `ERR_PACKAGE_PATH_NOT_EXPORTED` errors at runtime because Node.js package exports don't include `"./"` as a valid subpath.

The fix marks imports from ESM proxy modules as `external: true` in the `resolveId` hook, preventing Nitro's externals plugin from processing and mangling these imports. This ensures packages like `pg` and `ai` remain properly instrumented while working correctly with Nitro/Vite builds.
