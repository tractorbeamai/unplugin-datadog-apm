import { createRequire } from "node:module";

import { describe, expect, it, vi } from "vitest";

import { initTracer } from "../../src/core/init-tracer";

describe("initTracer", () => {
  it("initializes dd-trace and logs debug messages", () => {
    const require = createRequire(import.meta.url);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const moduleNamespace = { register: vi.fn() };
    const debugMessages = {
      init: "[test] init",
      tracerProvider: "[test] tracer",
      loaderHook: "[test] loader",
    };

    initTracer({
      require,
      debug: true,
      debugMessages,
      registerLoaderHook: true,
      moduleNamespace,
      loaderHookBaseUrl: "file:///test/",
      iitmExclusions: ["fs"],
      isMainThread: true,
    });

    expect(logSpy).toHaveBeenCalledWith(debugMessages.init);
    expect(logSpy).toHaveBeenCalledWith(debugMessages.tracerProvider);
    expect(logSpy).toHaveBeenCalledWith(debugMessages.loaderHook);
    expect(moduleNamespace.register).toHaveBeenCalledTimes(1);

    const registerCall = moduleNamespace.register.mock.calls[0];
    expect(registerCall?.[1]).toBe("file:///test/");
    expect(registerCall?.[2]).toEqual({ data: { exclude: ["fs"] } });

    logSpy.mockRestore();
  });

  it("skips initialization when not on the main thread", () => {
    const require = createRequire(import.meta.url);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const moduleNamespace = { register: vi.fn() };

    initTracer({
      require,
      debug: true,
      debugMessages: {
        init: "[test] init",
        tracerProvider: "[test] tracer",
        loaderHook: "[test] loader",
      },
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
