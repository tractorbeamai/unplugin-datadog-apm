interface WebpackLikeCompiler {
  options: { externals?: unknown };
}

type WebpackLikeHook = (compiler: WebpackLikeCompiler) => void;

interface WebpackLikeConfigOptions {
  bundlerName: "webpack" | "rspack";
}

/**
 * No-op hook function for webpack-style bundlers.
 * Externals are now configured manually by the user.
 */
function noopHook(): void {
  // No-op: externals are now configured manually by the user
}

/**
 * Create a webpack-style compiler hook.
 *
 * Externals are no longer auto-injected. Use `DatadogAPM.externals` to get
 * the list of modules that should be externalized and add them to your
 * webpack config manually.
 *
 * @param _options - Options (unused after externals removal).
 * @returns No-op hook function.
 */
export function createWebpackLikeConfig(
  _options: WebpackLikeConfigOptions,
): WebpackLikeHook {
  return noopHook;
}
