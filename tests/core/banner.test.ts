/**
 * Unit tests for banner generation.
 * Tests git metadata banner generation.
 */
import { describe, expect, it } from "vitest";

import { generateGitMetadataBanner } from "../../src/core/banner";

describe("generateGitMetadataBanner", () => {
  it("returns empty string when no metadata provided", () => {
    const banner = generateGitMetadataBanner();
    expect(banner).toBe("");
  });

  it("returns empty string when metadata has no values", () => {
    const banner = generateGitMetadataBanner({});
    expect(banner).toBe("");
  });

  it("includes repository URL when provided", () => {
    const banner = generateGitMetadataBanner({
      repositoryURL: "https://github.com/example/repo",
    });

    expect(banner).toContain("process.env.DD_GIT_REPOSITORY_URL");
    expect(banner).toContain('"https://github.com/example/repo"');
  });

  it("includes commit SHA when provided", () => {
    const banner = generateGitMetadataBanner({
      commitSHA: "abc123def456",
    });

    expect(banner).toContain("process.env.DD_GIT_COMMIT_SHA");
    expect(banner).toContain('"abc123def456"');
  });

  it("includes both repository URL and commit SHA when both provided", () => {
    const banner = generateGitMetadataBanner({
      repositoryURL: "https://github.com/example/repo",
      commitSHA: "abc123def456",
    });

    expect(banner).toContain("process.env.DD_GIT_REPOSITORY_URL");
    expect(banner).toContain('"https://github.com/example/repo"');
    expect(banner).toContain("process.env.DD_GIT_COMMIT_SHA");
    expect(banner).toContain('"abc123def456"');
  });

  it("wraps in process.env safety check", () => {
    const banner = generateGitMetadataBanner({
      repositoryURL: "https://github.com/example/repo",
    });

    expect(banner).toContain('typeof process === "object"');
    expect(banner).toContain("process !== null");
    expect(banner).toContain("process.env !== null");
    expect(banner).toContain('typeof process.env === "object"');
  });

  it("properly escapes special characters in URLs", () => {
    const banner = generateGitMetadataBanner({
      repositoryURL: "https://github.com/org/repo-with-dash",
    });

    expect(banner).toContain('"https://github.com/org/repo-with-dash"');
  });
});
