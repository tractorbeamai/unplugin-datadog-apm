/**
 * Unit tests for git metadata extraction.
 */
import { execSync } from "node:child_process";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getGitMetadata, type GitMetadata } from "../../src/core/git";

// Mock child_process to control git command outputs
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

const mockedExecSync = vi.mocked(execSync);

describe("getGitMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("when git is available", () => {
    it("returns repository URL and commit SHA", () => {
      mockedExecSync
        .mockReturnValueOnce("git@github.com:org/repo.git\n")
        .mockReturnValueOnce("abc123def456\n");

      const result = getGitMetadata();

      expect(result.repositoryURL).toBe("git@github.com:org/repo.git");
      expect(result.commitSHA).toBe("abc123def456");
    });

    it("trims whitespace from git outputs", () => {
      mockedExecSync
        .mockReturnValueOnce("  https://github.com/org/repo.git  \n")
        .mockReturnValueOnce("  abc123  \n");

      const result = getGitMetadata();

      expect(result.repositoryURL).toBe("https://github.com/org/repo.git");
      expect(result.commitSHA).toBe("abc123");
    });

    it("handles HTTPS repository URLs", () => {
      mockedExecSync
        .mockReturnValueOnce("https://github.com/org/repo.git\n")
        .mockReturnValueOnce("abc123\n");

      const result = getGitMetadata();

      expect(result.repositoryURL).toBe("https://github.com/org/repo.git");
    });

    it("calls git with correct commands", () => {
      mockedExecSync.mockReturnValueOnce("url\n").mockReturnValueOnce("sha\n");

      getGitMetadata();

      expect(mockedExecSync).toHaveBeenCalledWith(
        "git config --get remote.origin.url",
        expect.objectContaining({
          encoding: "utf8",
          stdio: ["pipe", "pipe", "ignore"],
        }),
      );

      expect(mockedExecSync).toHaveBeenCalledWith(
        "git rev-parse HEAD",
        expect.objectContaining({
          encoding: "utf8",
          stdio: ["pipe", "pipe", "ignore"],
        }),
      );
    });
  });

  describe("when git is not available", () => {
    it("returns empty object when both commands fail", () => {
      mockedExecSync.mockImplementation(() => {
        throw new Error("git not found");
      });

      const result = getGitMetadata();

      expect(result).toEqual({});
    });

    it("returns only repositoryURL when rev-parse fails", () => {
      mockedExecSync
        .mockReturnValueOnce("git@github.com:org/repo.git\n")
        .mockImplementationOnce(() => {
          throw new Error("not a git repository");
        });

      const result = getGitMetadata();

      expect(result.repositoryURL).toBe("git@github.com:org/repo.git");
      expect(result.commitSHA).toBeUndefined();
    });

    it("returns only commitSHA when remote.origin.url fails", () => {
      mockedExecSync
        .mockImplementationOnce(() => {
          throw new Error("no remote configured");
        })
        .mockReturnValueOnce("abc123\n");

      const result = getGitMetadata();

      expect(result.repositoryURL).toBeUndefined();
      expect(result.commitSHA).toBe("abc123");
    });
  });

  describe("type safety", () => {
    it("returns GitMetadata type", () => {
      mockedExecSync.mockImplementation(() => {
        throw new Error("git not found");
      });

      const result: GitMetadata = getGitMetadata();

      // Type should allow undefined values
      expect(result.repositoryURL).toBeUndefined();
      expect(result.commitSHA).toBeUndefined();
    });
  });
});
