import { expect } from "vitest";

export function expectInstrumented(code: string): void {
  expect(code).toContain("dd-trace:bundler:load");
}

export function expectNotInstrumented(code: string): void {
  expect(code).not.toContain("dd-trace:bundler:load");
}

export function expectIitmProxyInjected(code: string): void {
  expect(code).toContain("import-in-the-middle/lib/register.js");
  expect(code).toContain("register");
}
