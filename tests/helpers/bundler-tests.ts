/**
 * Shared test suite builder for bundler tests.
 * Provides factory functions to generate common test cases that are identical
 * across bundlers, reducing duplication while allowing bundler-specific tests.
 *
 * @see tests/bundlers/webpack.test.ts - Example usage
 * @see tests/bundlers/rspack.test.ts - Example usage
 */
import { describe, expect, it } from "vitest";

import {
  expectInstrumented,
  expectNotInstrumented,
} from "../helpers/assertions";
import { createCustomCjsFixture, createPinoFixture } from "../helpers/fixtures";
import { createFixture } from "../utils";

/**
 * Plugin options accepted by all bundler plugins.
 */
export interface CommonPluginOptions {
  debug?: boolean;
  excludeModules?: string[];
  additionalModules?: string[];
}

/**
 * Generic plugin factory type - accepts options and returns a bundler plugin.
 */
export type PluginFactory<TPlugin> = (options?: CommonPluginOptions) => TPlugin;

/**
 * Configuration for running a CJS build with excludeModules test.
 */
export interface ExcludeModulesTestConfig {
  /** Temporary directory with fixture files. */
  tempDir: string;
  /** Plugin instance with excludeModules: ["pino"]. */
  plugin: unknown;
}

/**
 * Configuration for running a CJS build with additionalModules test.
 */
export interface AdditionalModulesTestConfig {
  /** Temporary directory with fixture files. */
  tempDir: string;
  /** Plugin instance with additionalModules: ["custom-pkg"]. */
  plugin: unknown;
}

/**
 * Runner function type for building and returning output content.
 * Each bundler provides its own implementation.
 */
export type BuildRunner = (config: {
  tempDir: string;
  plugin: unknown;
}) => Promise<string>;

/**
 * Configuration for generating shared test suites.
 */
export interface SharedTestSuiteConfig<TPlugin> {
  /** Name of the bundler (e.g., "webpack", "rspack"). */
  bundlerName: string;
  /** Factory function that creates the bundler plugin. */
  createPlugin: PluginFactory<TPlugin>;
  /**
   * Optional runner for excludeModules test.
   * If provided, generates a test that verifies excludeModules option.
   */
  runExcludeModulesTest?: BuildRunner;
  /**
   * Optional runner for additionalModules test.
   * If provided, generates a test that verifies additionalModules option.
   */
  runAdditionalModulesTest?: BuildRunner;
  /**
   * Function to get the temp directory for fixture creation.
   * Should return an object with a `dir` property containing the temp path.
   */
  getTemp: () => { dir: string };
}

/**
 * Generates plugin metadata tests that verify basic plugin creation.
 * These tests are identical across all bundlers.
 *
 * @param bundlerName - Name of the bundler for test descriptions.
 * @param createPlugin - Factory function to create the plugin.
 */
export function describePluginMetadata<TPlugin>(
  bundlerName: string,
  createPlugin: PluginFactory<TPlugin>,
): void {
  describe("plugin metadata", () => {
    it("creates a plugin when called", () => {
      const plugin = createPlugin();
      expect(plugin).toBeDefined();
      expect(typeof plugin).toBe("object");
    });

    it("accepts options", () => {
      const plugin = createPlugin({ debug: true });
      expect(plugin).toBeDefined();
    });
  });
}

/**
 * Generates a test for the excludeModules option.
 * Creates a pino fixture and verifies that excluding "pino" prevents wrapping.
 *
 * @param config - Test configuration including plugin factory and build runner.
 */
export function describeExcludeModules<TPlugin>(
  config: Pick<
    SharedTestSuiteConfig<TPlugin>,
    "createPlugin" | "getTemp" | "runExcludeModulesTest"
  >,
): void {
  if (!config.runExcludeModulesTest) {
    return;
  }

  describe("excludeModules option (shared)", () => {
    it("respects excludeModules option for CJS modules", async () => {
      const temp = config.getTemp();

      createFixture(temp.dir, {
        "index.js": `const pino = require('pino'); module.exports = pino;`,
        ...createPinoFixture(),
      });

      const plugin = config.createPlugin({
        excludeModules: ["pino"],
      });

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- checked above
      const output = await config.runExcludeModulesTest!({
        tempDir: temp.dir,
        plugin,
      });

      // Should NOT wrap excluded module
      expectNotInstrumented(output);
    });
  });
}

/**
 * Generates a test for the additionalModules option.
 * Creates a custom-pkg fixture and verifies that adding it enables wrapping.
 *
 * @param config - Test configuration including plugin factory and build runner.
 */
export function describeAdditionalModules<TPlugin>(
  config: Pick<
    SharedTestSuiteConfig<TPlugin>,
    "createPlugin" | "getTemp" | "runAdditionalModulesTest"
  >,
): void {
  if (!config.runAdditionalModulesTest) {
    return;
  }

  describe("additionalModules option (shared)", () => {
    it("respects additionalModules option for custom modules", async () => {
      const temp = config.getTemp();

      createFixture(temp.dir, {
        "index.js": `const custom = require('custom-pkg'); module.exports = custom;`,
        ...createCustomCjsFixture("custom-pkg"),
      });

      const plugin = config.createPlugin({
        additionalModules: ["custom-pkg"],
      });

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- checked above
      const output = await config.runAdditionalModulesTest!({
        tempDir: temp.dir,
        plugin,
      });

      // Should wrap additional module
      expectInstrumented(output);
      expect(output).toContain("custom-pkg");
    });
  });
}

/**
 * Generates all shared test suites for a bundler.
 * This is a convenience function that calls all individual describe functions.
 *
 * @param config - Full configuration for generating shared tests.
 *
 * @example
 * ```ts
 * describeSharedTests({
 *   bundlerName: "webpack",
 *   createPlugin: webpackPlugin,
 *   getTemp: () => temp,
 *   runExcludeModulesTest: async ({ tempDir, plugin }) => {
 *     // Run webpack build and return output string
 *   },
 *   runAdditionalModulesTest: async ({ tempDir, plugin }) => {
 *     // Run webpack build and return output string
 *   },
 * });
 * ```
 */
export function describeSharedTests<TPlugin>(
  config: SharedTestSuiteConfig<TPlugin>,
): void {
  describePluginMetadata(config.bundlerName, config.createPlugin);
  describeExcludeModules(config);
  describeAdditionalModules(config);
}
