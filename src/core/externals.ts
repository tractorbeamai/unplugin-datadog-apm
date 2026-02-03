export type External = string | RegExp;
type ExternalLike =
  | External
  | ((...args: unknown[]) => unknown)
  | Record<string, unknown>;

function getExternalKey(ext: External): string {
  if (typeof ext === "string") return `str:${ext}`;
  return `re:${ext.source}/${ext.flags}`;
}

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

export function getStringExternals(externals: External[]): string[] {
  return externals.filter((e): e is string => typeof e === "string");
}
