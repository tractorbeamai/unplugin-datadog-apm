/**
 * External module specifier supported by bundlers.
 */
export type External = string | RegExp;
type ExternalLike =
  | External
  | ((...args: unknown[]) => unknown)
  | Record<string, unknown>;

/**
 * Normalize an external into a stable key for comparisons.
 *
 * @param ext - External value to normalize.
 * @returns String key for comparison.
 */
function getExternalKey(ext: External): string {
  if (typeof ext === "string") return `str:${ext}`;
  return `re:${ext.source}/${ext.flags}`;
}

/**
 * Append required externals while preserving existing entries.
 *
 * This keeps non-string externals intact and avoids duplicates.
 *
 * @param existing - Existing externals list.
 * @param required - Required externals to add.
 * @returns Updated externals list with required items appended.
 */
function dedupeRequiredExternals(
  existing: ExternalLike[],
  required: External[],
): ExternalLike[] {
  const seen = new Set<string>();

  for (const item of existing) {
    if (typeof item === "string" || item instanceof RegExp) {
      seen.add(getExternalKey(item));
    }
  }

  const uniqueRequired: External[] = [];
  for (const req of required) {
    const key = getExternalKey(req);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueRequired.push(req);
  }

  return [...existing, ...uniqueRequired];
}

/**
 * Check if an import source matches the external list.
 *
 * @param source - Import specifier to test.
 * @param externals - List of externals with strings or patterns.
 * @returns True when the source matches.
 */
export function matchesExternal(
  source: string,
  externals: External[],
): boolean {
  for (const ext of externals) {
    if (typeof ext === "string" && source === ext) return true;
    if (ext instanceof RegExp && ext.test(source)) return true;
  }
  return false;
}

/**
 * Merge required externals into an existing externals config.
 *
 * Works with the three common bundler forms: array, function, or single
 * value. Functions are wrapped so required externals always win.
 *
 * @param existing - Existing bundler externals config.
 * @param required - Externals that must always be preserved.
 * @returns Updated externals config that includes required entries.
 */
export function mergeExternals(
  existing: unknown,
  required: External[],
):
  | External[]
  | ((source: string, importer?: string, isResolved?: boolean) => boolean) {
  if (typeof existing === "function") {
    return (source, importer, isResolved) => {
      if (matchesExternal(source, required)) return true;
      return (existing as (s: string, i?: string, r?: boolean) => boolean)(
        source,
        importer,
        isResolved,
      );
    };
  }
  const existingArray = Array.isArray(existing)
    ? (existing as External[])
    : typeof existing === "string" || existing instanceof RegExp
      ? [existing]
      : [];
  return dedupeRequiredExternals(existingArray, required) as External[];
}

/**
 * Append required externals without changing the config shape.
 *
 * @param existing - Existing bundler externals config.
 * @param required - Externals that must always be preserved.
 * @returns Externals list with required entries appended.
 */
export function appendExternals(
  existing: unknown,
  required: External[],
): ExternalLike[] {
  if (Array.isArray(existing)) {
    return dedupeRequiredExternals(existing as ExternalLike[], required);
  }
  if (existing) {
    return dedupeRequiredExternals([existing as ExternalLike], required);
  }
  return [...required];
}

/**
 * Return only string externals for APIs that reject RegExp entries.
 *
 * @param externals - Mixed externals list.
 * @returns Externals filtered to strings only.
 */
export function getStringExternals(externals: External[]): string[] {
  return externals.filter((e): e is string => typeof e === "string");
}
