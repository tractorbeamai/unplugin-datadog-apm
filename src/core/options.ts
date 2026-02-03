import type { Tracer } from "dd-trace";

/**
 * User-facing plugin options.
 */
export interface Options {
  /** Enable debug logging (default: !!process.env.DD_TRACE_DEBUG) */
  debug?: boolean;
  /** Additional modules to instrument beyond dd-trace defaults */
  additionalModules?: string[];
  /** Modules to exclude from instrumentation */
  excludeModules?: string[];
  /** Options forwarded to dd-trace init */
  tracerOptions?: Parameters<Tracer["init"]>[0];
  /**
   * Automatically wrap entry points with dd-trace initialization.
   * When enabled, detected entry points are wrapped to initialize dd-trace
   * before any other code, ensuring dd-trace instruments modules correctly.
   *
   * @default true
   */
  autoInit?: boolean;
}

export type OptionsResolved = Required<Options>;

/**
 * Normalize plugin options by applying defaults.
 *
 * @param options - Partial options provided by the user.
 * @returns Fully resolved options.
 */
export function resolveOptions(options: Options): OptionsResolved {
  return {
    debug: options.debug ?? !!process.env.DD_TRACE_DEBUG,
    additionalModules: options.additionalModules ?? [],
    excludeModules: options.excludeModules ?? [],
    tracerOptions: options.tracerOptions ?? {},
    autoInit: options.autoInit ?? true,
  };
}
