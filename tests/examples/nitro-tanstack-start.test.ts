/**
 * Integration test for the vite-nitro-tanstack-start example.
 * Runs a shell script that builds, starts, and verifies the example.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(__dirname, "nitro-tanstack-start.sh");

describe("vite-nitro-tanstack-start example", () => {
  it("captures traces with --import register", () => {
    const result = execSync(`bash "${SCRIPT_PATH}"`, {
      encoding: "utf-8",
      timeout: 60_000,
    });
    expect(result).toContain("All checks passed");
  }, 60_000);
});
