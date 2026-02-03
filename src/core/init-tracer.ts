import type { Tracer } from "dd-trace";

interface DebugMessages {
  init: string;
  tracerProvider: string;
  loaderHook?: string;
}

export interface InitTracerOptions {
  require: NodeJS.Require;
  debug: boolean;
  debugMessages: DebugMessages;
  registerLoaderHook?: boolean;
  moduleNamespace?: {
    register?: (
      specifier: string,
      parentURL?: string | URL,
      options?: { data?: { exclude?: (string | RegExp)[] } },
    ) => void;
  };
  loaderHookBaseUrl?: string;
  iitmExclusions?: (string | RegExp)[];
  isMainThread?: boolean;
}

function logDebug(enabled: boolean, message: string | undefined): void {
  if (!enabled || !message) return;
  console.log(message);
}

export function initTracer(options: InitTracerOptions): void {
  if (options.isMainThread === false) return;

  const tracer = options.require("dd-trace") as Tracer;
  tracer.init();
  logDebug(options.debug, options.debugMessages.init);

  const tracerProvider = new tracer.TracerProvider();
  tracerProvider.register();
  logDebug(options.debug, options.debugMessages.tracerProvider);

  if (
    options.registerLoaderHook &&
    options.moduleNamespace &&
    options.loaderHookBaseUrl &&
    typeof options.moduleNamespace.register === "function"
  ) {
    const ddTraceLoaderHook = options.require.resolve(
      "dd-trace/loader-hook.mjs",
    );
    options.moduleNamespace.register(
      ddTraceLoaderHook,
      options.loaderHookBaseUrl,
      {
        data: { exclude: options.iitmExclusions ?? [] },
      },
    );
    logDebug(options.debug, options.debugMessages.loaderHook);
  }
}
