import path from "node:path";
import { fileURLToPath } from "node:url";

import { includeIgnoreFile } from "@eslint/compat";
import { defineConfig, globalIgnores } from "eslint/config";

import { base, node, typescript } from "@tractorbeam/eslint-config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig([
  base,
  typescript,
  node,
  includeIgnoreFile(path.resolve(__dirname, ".gitignore")),
  globalIgnores(["dist/**", "prior_work/**", "*.config.ts"]),
]);
