/**
 * Serialize dd-trace init options into valid JavaScript source.
 */
export function serializeInitOptions(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";

  if (value instanceof RegExp) return value.toString();

  const valueType = typeof value;

  if (valueType === "string") return JSON.stringify(value);
  if (valueType === "number") return JSON.stringify(value);
  if (valueType === "boolean") return JSON.stringify(value);
  if (valueType === "bigint") return `${value}n`;
  if (valueType === "function") return value.toString();

  if (Array.isArray(value)) {
    return `[${value.map(serializeInitOptions).join(",")}]`;
  }

  if (valueType === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return `{${entries
      .map(
        ([key, entryValue]) =>
          `${JSON.stringify(key)}:${serializeInitOptions(entryValue)}`,
      )
      .join(",")}}`;
  }

  return "undefined";
}
