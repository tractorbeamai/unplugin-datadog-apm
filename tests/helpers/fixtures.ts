/**
 * Shared test fixture builders to reduce duplication across test files.
 */

/**
 * Creates a pino CJS module fixture.
 */
export function createPinoFixture(version = "8.0.0"): Record<string, string> {
  return {
    "node_modules/pino/package.json": JSON.stringify({
      name: "pino",
      version,
      main: "index.js",
    }),
    "node_modules/pino/index.js": `module.exports = { log: function() {} };`,
  };
}

/**
 * Creates an undici ESM module fixture.
 */
export function createUndiciFixture(version = "6.0.0"): Record<string, string> {
  return {
    "node_modules/undici/package.json": JSON.stringify({
      name: "undici",
      version,
      type: "module",
      main: "index.js",
    }),
    "node_modules/undici/index.js": `export const fetch = () => {};\nexport const something = () => {};`,
  };
}

/**
 * Creates an ioredis CJS module fixture.
 */
export function createIoredisFixture(
  version = "5.0.0",
): Record<string, string> {
  return {
    "node_modules/ioredis/package.json": JSON.stringify({
      name: "ioredis",
      version,
      main: "index.js",
    }),
    "node_modules/ioredis/index.js": `module.exports = function Redis() {};`,
  };
}

/**
 * Creates a lodash fixture with submodule support.
 */
export function createLodashFixture(
  version = "4.17.21",
): Record<string, string> {
  return {
    "node_modules/lodash/package.json": JSON.stringify({
      name: "lodash",
      version,
    }),
    "node_modules/lodash/get.js": `module.exports = function get() {};`,
    "node_modules/lodash/fp/get.js": `module.exports = function get() {};`,
  };
}

/**
 * Creates a custom CJS module fixture.
 */
export function createCustomCjsFixture(
  name: string,
  version = "1.0.0",
  code = `module.exports = { hello: "world" };`,
): Record<string, string> {
  return {
    [`node_modules/${name}/package.json`]: JSON.stringify({
      name,
      version,
      main: "index.js",
    }),
    [`node_modules/${name}/index.js`]: code,
  };
}

/**
 * Creates a custom ESM module fixture.
 */
export function createCustomEsmFixture(
  name: string,
  version = "1.0.0",
  code = `export const value = 42;`,
): Record<string, string> {
  return {
    [`node_modules/${name}/package.json`]: JSON.stringify({
      name,
      version,
      type: "module",
      main: "index.js",
    }),
    [`node_modules/${name}/index.js`]: code,
  };
}

/**
 * Creates an @aws-sdk/smithy-client fixture (scoped package).
 */
export function createAwsSdkSmithyClientFixture(
  version = "3.400.0",
): Record<string, string> {
  return {
    "node_modules/@aws-sdk/smithy-client/package.json": JSON.stringify({
      name: "@aws-sdk/smithy-client",
      version,
      main: "index.js",
    }),
    "node_modules/@aws-sdk/smithy-client/index.js": `module.exports = { Client: function() {} };`,
  };
}

/**
 * Creates an @aws-sdk/client-s3 fixture (scoped package).
 */
export function createAwsSdkS3Fixture(
  version = "3.500.0",
): Record<string, string> {
  return {
    "node_modules/@aws-sdk/client-s3/package.json": JSON.stringify({
      name: "@aws-sdk/client-s3",
      version,
      main: "index.js",
    }),
    "node_modules/@aws-sdk/client-s3/index.js": `module.exports = { GetObjectCommand: function() {} };`,
  };
}

/**
 * Combines multiple fixture records into one.
 */
export function combineFixtures(
  ...fixtures: Record<string, string>[]
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const fixture of fixtures) {
    Object.assign(merged, fixture);
  }
  return merged;
}
