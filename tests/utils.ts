import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname: string = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT: string = path.resolve(__dirname, "..");

/**
 * Creates a temporary directory for test fixtures.
 * Returns the directory path and a cleanup function.
 *
 * For most tests, use this function. For runtime tests that need ESM module
 * resolution to find project dependencies, use createRuntimeTempDir instead.
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
 * Creates a temporary directory within the project root.
 * This is needed for runtime tests where ESM module resolution must be able
 * to find the project's node_modules by walking up the directory tree.
 */
export function createRuntimeTempDir(): {
  tempDir: string;
  cleanup: () => void;
} {
  const tempBase = path.join(PROJECT_ROOT, ".test-temp");
  mkdirSync(tempBase, { recursive: true });
  const tempDir = mkdtempSync(path.join(tempBase, "dd-plugin-test-"));
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

/**
 * Runtime test utilities for verifying bundled output
 */

export interface ServerProcess {
  proc: ChildProcess;
  port: number;
}

/**
 * Start a bundled server and wait for it to listen on a port.
 * Parses "LISTENING:PORT" from stdout.
 *
 * The temp directory is within the project, so both CJS and ESM can
 * resolve externalized packages from the project's node_modules.
 */
export function startServer(
  bundlePath: string,
  env?: Record<string, string>,
): Promise<ServerProcess> {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", [bundlePath], {
      cwd: path.dirname(bundlePath),
      env: {
        ...process.env,
        ...env,
        DD_TRACE_STARTUP_LOGS: "false",
        DD_TRACE_AGENT_URL: "http://127.0.0.1:1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        proc.kill("SIGKILL");
        reject(
          new Error(
            `Server startup timeout.\nStdout: ${stdout}\nStderr: ${stderr}`,
          ),
        );
      }
    }, 10_000);

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
      const match = /LISTENING:(\d+)/.exec(stdout);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({ proc, port: Number.parseInt(match[1], 10) });
      }
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    proc.on("exit", (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(
          new Error(
            `Server exited with code ${code}.\nStdout: ${stdout}\nStderr: ${stderr}`,
          ),
        );
      }
    });
  });
}

/**
 * Stop a server process gracefully.
 */
export function stopServer(proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (!proc.pid) {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve();
    }, 2000);

    proc.on("exit", () => {
      clearTimeout(timeout);
      resolve();
    });

    proc.kill("SIGTERM");
  });
}

/**
 * Fetch the /health endpoint and parse JSON response.
 */
export async function fetchHealth(
  port: number,
): Promise<{ hasActiveSpan: boolean; traceId?: string; spanId?: string }> {
  const response = await fetch(`http://localhost:${port}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }
  return (await response.json()) as {
    hasActiveSpan: boolean;
    traceId?: string;
    spanId?: string;
  };
}
