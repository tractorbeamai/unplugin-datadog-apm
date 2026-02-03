declare module "import-in-the-middle/lib/get-exports.mjs" {
  export function getExports(
    url: URL,
    context: { format: "module" | "commonjs" },
    getSource: (
      url: URL,
      context: { format: "module" | "commonjs" },
    ) => { source: string; format: "module" | "commonjs" },
  ): Promise<string[]>;
}
