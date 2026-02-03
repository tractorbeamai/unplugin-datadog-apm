/**
 * Git metadata utilities.
 *
 * @module
 */

import { execSync } from "node:child_process";

export interface GitMetadata {
  repositoryURL?: string;
  commitSHA?: string;
}

/**
 * Extract git metadata from the current repository.
 *
 * Returns repository URL and commit SHA if available.
 * Silently returns empty values if git is not available.
 */
export function getGitMetadata(): GitMetadata {
  const result: GitMetadata = {};

  try {
    result.repositoryURL = execSync("git config --get remote.origin.url", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    // Git not available
  }

  try {
    result.commitSHA = execSync("git rev-parse HEAD", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    // Git not available
  }

  return result;
}
