/**
 * Shared bundler runner utilities for tests.
 * Provides promise-based wrappers for webpack and rspack.
 */
import { rspack, type RspackOptions } from "@rspack/core";
import webpack from "webpack";

/**
 * Runs webpack with the given configuration.
 * @param config - Webpack configuration object.
 * @returns A promise that resolves with the webpack stats on success.
 */
export function runWebpack(
  config: webpack.Configuration,
): Promise<webpack.Stats> {
  return new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      if (err) {
        reject(err);
        return;
      }
      if (!stats) {
        reject(new Error("No stats returned"));
        return;
      }
      if (stats.hasErrors()) {
        const info = stats.toJson();
        reject(new Error(info.errors?.map((e) => e.message).join("\n")));
        return;
      }
      resolve(stats);
    });
  });
}

/**
 * Runs rspack with the given configuration.
 * @param config - Rspack configuration object.
 * @returns A promise that resolves on successful build.
 */
export function runRspack(config: RspackOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    rspack(config, (err, stats) => {
      if (err) {
        reject(err);
        return;
      }
      if (stats?.hasErrors()) {
        const info = stats.toJson();
        reject(new Error(info.errors?.map((e) => e.message).join("\n")));
        return;
      }
      resolve();
    });
  });
}
