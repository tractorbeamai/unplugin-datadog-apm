/**
 * Banner generation for bundler output.
 *
 * Provides git metadata injection for Datadog source code integration.
 *
 * @module
 */

import type { GitMetadata } from "./git";

/**
 * Generate JS to inject git metadata into process.env.
 *
 * This enables Datadog to link traces to source code in version control.
 *
 * @param metadata - Optional git metadata.
 * @returns Banner source that sets git metadata env vars, or empty string.
 * @see https://github.com/DataDog/dd-trace-js/blob/master/packages/datadog-esbuild/index.js
 */
export function generateGitMetadataBanner(metadata?: GitMetadata): string {
  if (!metadata?.repositoryURL && !metadata?.commitSHA) return "";

  return `if (typeof process === "object" && process !== null &&
  process.env !== null && typeof process.env === "object") {
${metadata.repositoryURL ? `  process.env.DD_GIT_REPOSITORY_URL = ${JSON.stringify(metadata.repositoryURL)};` : ""}
${metadata.commitSHA ? `  process.env.DD_GIT_COMMIT_SHA = ${JSON.stringify(metadata.commitSHA)};` : ""}
}`;
}
