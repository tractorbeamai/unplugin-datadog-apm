/**
 * Shared type definitions for the plugin.
 *
 * @module
 */

export interface ExtractedModule {
  pkg: string;
  path: string;
  pkgJson: string;
}

export interface ModuleInfo {
  extractedModule: ExtractedModule;
  version: string;
  fullPath: string;
  isESM: boolean;
  isBuiltin: boolean;
  rawImportPath: string;
}

export interface PluginData {
  info: ModuleInfo;
  shouldWrap: boolean;
}
