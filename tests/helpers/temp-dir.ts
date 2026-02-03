import { afterEach, beforeEach } from "vitest";

import { createRuntimeTempDir, createTempDir } from "../utils";

export function useTempDir(): { get dir(): string } {
  let dir = "";
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    const temp = createTempDir();
    dir = temp.tempDir;
    cleanup = temp.cleanup;
  });

  afterEach(() => {
    cleanup?.();
  });

  return {
    get dir() {
      return dir;
    },
  };
}

export function useRuntimeTempDir(): { get dir(): string } {
  let dir = "";
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    const temp = createRuntimeTempDir();
    dir = temp.tempDir;
    cleanup = temp.cleanup;
  });

  afterEach(() => {
    cleanup?.();
  });

  return {
    get dir() {
      return dir;
    },
  };
}
