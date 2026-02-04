---
"unplugin-datadog-apm": patch
---

Remove unused `nitro-plugin` export. This module was never integrated into the Vite plugin and provided no functionality. Users should use `--import unplugin-datadog-apm/register` for initialization instead.
