import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Creates a temporary directory for test fixtures.
 * Returns the directory path and a cleanup function.
 */
export function createTempDir(): { tempDir: string; cleanup: () => void } {
  const tempDir = mkdtempSync(path.join(tmpdir(), "dd-plugin-test-"));
  return {
    tempDir,
    cleanup: () => {
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

/**
 * Creates files in a directory from a record of relative paths to contents.
 */
export function createFixture(
  baseDir: string,
  files: Record<string, string>,
): void {
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(baseDir, filePath);
    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
  }
}

/**
 * Creates a package.json content string.
 */
export function createPackageJson(options: {
  name: string;
  version: string;
  main?: string;
  type?: "module" | "commonjs";
  exports?: Record<string, string>;
}): string {
  return JSON.stringify({
    name: options.name,
    version: options.version,
    ...(options.main && { main: options.main }),
    ...(options.type && { type: options.type }),
    ...(options.exports && { exports: options.exports }),
  });
}
