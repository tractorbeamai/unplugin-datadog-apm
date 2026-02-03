/**
 * Tests for bundler entry file exports.
 * Verifies all bundler entry exports work correctly.
 */
import { describe, expect, it } from "vitest";

import esbuildPlugin from "../../src/esbuild";
import rolldownPlugin from "../../src/rolldown";
import rollupPlugin from "../../src/rollup";
import rspackPlugin from "../../src/rspack";
import vitePlugin from "../../src/vite";
import webpackPlugin from "../../src/webpack";

describe("bundler entry exports", () => {
  describe("webpack entry", () => {
    it("exports a function", () => {
      expect(typeof webpackPlugin).toBe("function");
    });

    it("returns a plugin when called", () => {
      expect(webpackPlugin()).toBeDefined();
      expect(typeof webpackPlugin()).toBe("object");
    });

    it("accepts options", () => {
      expect(webpackPlugin({ debug: true })).toBeDefined();
    });
  });

  describe("esbuild entry", () => {
    it("exports a function", () => {
      expect(typeof esbuildPlugin).toBe("function");
    });

    it("returns a plugin when called", () => {
      expect(esbuildPlugin()).toBeDefined();
      expect(typeof esbuildPlugin()).toBe("object");
    });

    it("plugin has name property", () => {
      const plugin = esbuildPlugin() as { name: string };
      expect(plugin.name).toBe("unplugin-datadog-apm");
    });

    it("accepts options", () => {
      expect(
        esbuildPlugin({ debug: true, additionalModules: ["custom"] }),
      ).toBeDefined();
    });
  });

  describe("rspack entry", () => {
    it("exports a function", () => {
      expect(typeof rspackPlugin).toBe("function");
    });

    it("returns a plugin when called", () => {
      expect(rspackPlugin()).toBeDefined();
      expect(typeof rspackPlugin()).toBe("object");
    });

    it("accepts options", () => {
      expect(rspackPlugin({ excludeModules: ["pino"] })).toBeDefined();
    });
  });

  describe("rolldown entry", () => {
    it("exports a function", () => {
      expect(typeof rolldownPlugin).toBe("function");
    });

    it("returns a plugin when called", () => {
      expect(rolldownPlugin()).toBeDefined();
      expect(typeof rolldownPlugin()).toBe("object");
    });

    it("plugin has name property", () => {
      const plugin = rolldownPlugin() as { name: string };
      expect(plugin.name).toBe("unplugin-datadog-apm");
    });

    it("accepts options", () => {
      expect(rolldownPlugin({ debug: false })).toBeDefined();
    });
  });

  describe("rollup entry", () => {
    it("exports a function", () => {
      expect(typeof rollupPlugin).toBe("function");
    });

    it("returns a plugin when called", () => {
      expect(rollupPlugin()).toBeDefined();
    });

    it("plugin has correct name", () => {
      const plugin = rollupPlugin();
      expect(plugin.name).toBe("unplugin-datadog-apm");
    });
  });

  describe("vite entry", () => {
    it("exports a function", () => {
      expect(typeof vitePlugin).toBe("function");
    });

    it("returns a plugin when called", () => {
      expect(vitePlugin()).toBeDefined();
    });

    it("plugin has correct name", () => {
      const plugin = vitePlugin();
      expect(plugin.name).toBe("unplugin-datadog-apm");
    });

    it("plugin has enforce: pre", () => {
      const plugin = vitePlugin();
      expect(plugin.enforce).toBe("pre");
    });
  });

  describe("all entries", () => {
    it("non-webpack plugins have the same name", () => {
      const esbuild = esbuildPlugin() as { name: string };
      const rolldown = rolldownPlugin() as { name: string };

      expect(esbuild.name).toBe("unplugin-datadog-apm");
      expect(rolldown.name).toBe("unplugin-datadog-apm");
    });

    it("webpack and rspack return plugin objects", () => {
      expect(webpackPlugin()).toBeDefined();
      expect(rspackPlugin()).toBeDefined();
    });
  });
});
