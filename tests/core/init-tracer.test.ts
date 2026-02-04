import { createRequire } from "node:module";

import { describe, expect, it, vi } from "vitest";

import { initTracer } from "../../src/core/init-tracer";

describe("initTracer", () => {
  it("initializes dd-trace and logs debug messages", () => {
    const require = createRequire(import.meta.url);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => null);
    const moduleNamespace = { register: vi.fn() };

    initTracer({
      require,
      debug: true,
      registerLoaderHook: true,
      moduleNamespace,
      loaderHookBaseUrl: "file:///test/",
      iitmExclusions: ["fs"],
      isMainThread: true,
    });

    expect(logSpy).toHaveBeenCalledWith(
      "[unplugin-datadog-apm] dd-trace initialized",
    );
    expect(logSpy).toHaveBeenCalledWith(
      "[unplugin-datadog-apm] TracerProvider registered with OTel API",
    );
    expect(logSpy).toHaveBeenCalledWith(
      "[unplugin-datadog-apm] ESM loader hook registered",
    );
    expect(moduleNamespace.register).toHaveBeenCalledTimes(1);

    const registerCall = moduleNamespace.register.mock.calls[0] as [
      string,
      string | URL | undefined,
      { data?: { exclude?: (string | RegExp)[] } } | undefined,
    ];
    const baseUrl = registerCall[1];
    const registerOptions = registerCall[2];
    expect(baseUrl).toBe("file:///test/");
    expect(registerOptions).toEqual({ data: { exclude: ["fs"] } });

    logSpy.mockRestore();
  });

  it("skips initialization when not on the main thread", () => {
    const require = createRequire(import.meta.url);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => null);
    const moduleNamespace = { register: vi.fn() };

    initTracer({
      require,
      debug: true,
      registerLoaderHook: true,
      moduleNamespace,
      loaderHookBaseUrl: "file:///test/",
      iitmExclusions: ["fs"],
      isMainThread: false,
    });

    expect(logSpy).not.toHaveBeenCalled();
    expect(moduleNamespace.register).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });
});
