import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      "node_modules/**",
      "prior_work/**",
      "**/examples/**/node_modules/**",
    ],
    // Ensure proper test isolation for files that use vi.mock()
    isolate: true,
    fileParallelism: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/__tests__/**",
        "src/**/*.test.ts",
        "src/**/*.spec.ts",
      ],
    },
  },
});
