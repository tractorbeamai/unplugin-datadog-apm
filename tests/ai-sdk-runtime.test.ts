/**
 * End-to-end runtime tests for AI SDK instrumentation with dd-trace.
 *
 * These tests verify that:
 * 1. Our plugin creates ESM proxies for AI SDK packages
 * 2. The bundled code runs correctly with dd-trace initialized
 */
import { execSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import nodeResolve from "@rollup/plugin-node-resolve";
import { rollup } from "rollup";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import rollupPlugin from "../src/rollup";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

describe("AI SDK dd-trace integration", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(projectRoot, `.test-temp-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createFiles(files: Record<string, string>) {
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(tempDir, filePath);
      mkdirSync(path.dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content);
    }
  }

  function runWithDdTrace(script = "bundle.mjs"): string {
    const ddTraceInit = path.join(
      projectRoot,
      "node_modules/dd-trace/initialize.mjs",
    );

    try {
      return execSync(`node --import "${ddTraceInit}" ${script} 2>&1`, {
        cwd: tempDir,
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_OPTIONS: "",
          DD_TRACE_ENABLED: "true",
          DD_LLMOBS_ENABLED: "true",
          DD_LLMOBS_AGENTLESS_ENABLED: "true",
          DD_API_KEY: "test-key",
          DD_SITE: "datadoghq.com",
          DD_LLMOBS_ML_APP: "test-app",
          DD_TRACE_AGENT_URL: "http://127.0.0.1:1",
          DD_TRACE_STARTUP_LOGS: "false",
        },
        timeout: 30_000,
      });
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string; message: string };
      return (e.stdout ?? "") + (e.stderr ?? "") + e.message;
    }
  }

  describe("ESM proxy creation", () => {
    it("creates import-in-the-middle proxy for ai package", async () => {
      createFiles({
        "node_modules/ai/package.json": JSON.stringify({
          name: "ai",
          version: "4.0.0",
          type: "module",
          main: "index.mjs",
        }),
        "node_modules/ai/index.mjs": `
          export function generateText() { return {}; }
          export function tool(config) { return config; }
        `,
        "app.mjs": `
          import { generateText, tool } from 'ai';
          console.log('AI_IMPORTED:', typeof generateText, typeof tool);
        `,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "app.mjs"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: tempDir }),
        ],
        external: ["import-in-the-middle/lib/register.js", "dc-polyfill"],
      });

      const result = await bundle.generate({ format: "es" });
      const code = result.output[0].code;

      expect(code).toContain("import-in-the-middle/lib/register.js");
      expect(code).toContain("register");
    });

    it("creates import-in-the-middle proxy for openai package", async () => {
      createFiles({
        "node_modules/openai/package.json": JSON.stringify({
          name: "openai",
          version: "4.0.0",
          type: "module",
          main: "index.mjs",
        }),
        "node_modules/openai/index.mjs": `
          export default class OpenAI { constructor() {} }
        `,
        "app.mjs": `
          import OpenAI from 'openai';
          console.log('OPENAI_IMPORTED:', typeof OpenAI);
        `,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "app.mjs"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: tempDir }),
        ],
        external: ["import-in-the-middle/lib/register.js", "dc-polyfill"],
      });

      const result = await bundle.generate({ format: "es" });
      const code = result.output[0].code;

      expect(code).toContain("import-in-the-middle/lib/register.js");
      expect(code).toContain("register");
    });

    it("creates import-in-the-middle proxy for @anthropic-ai/sdk", async () => {
      createFiles({
        "node_modules/@anthropic-ai/sdk/package.json": JSON.stringify({
          name: "@anthropic-ai/sdk",
          version: "0.10.0",
          type: "module",
          main: "index.mjs",
        }),
        "node_modules/@anthropic-ai/sdk/index.mjs": `
          export default class Anthropic { constructor() {} }
        `,
        "app.mjs": `
          import Anthropic from '@anthropic-ai/sdk';
          console.log('ANTHROPIC_IMPORTED:', typeof Anthropic);
        `,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "app.mjs"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: tempDir }),
        ],
        external: ["import-in-the-middle/lib/register.js", "dc-polyfill"],
      });

      const result = await bundle.generate({ format: "es" });
      const code = result.output[0].code;

      expect(code).toContain("import-in-the-middle/lib/register.js");
      expect(code).toContain("register");
    });
  });

  describe("runtime with dd-trace", () => {
    it("runs ai package with dd-trace initialized", async () => {
      createFiles({
        "app.mjs": `
          import { generateText, streamText, tool } from 'ai';
          console.log('GENERATE_TEXT:', typeof generateText);
          console.log('STREAM_TEXT:', typeof streamText);
          console.log('TOOL:', typeof tool);
        `,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "app.mjs"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: projectRoot }),
        ],
        external: ["ai", "import-in-the-middle/lib/register.js", "dc-polyfill"],
      });

      const result = await bundle.generate({ format: "es" });
      writeFileSync(path.join(tempDir, "bundle.mjs"), result.output[0].code);

      const output = runWithDdTrace();

      expect(output).toContain("GENERATE_TEXT: function");
      expect(output).toContain("STREAM_TEXT: function");
      expect(output).toContain("TOOL: function");
    });

    it("runs openai package with dd-trace initialized", async () => {
      createFiles({
        "app.mjs": `
          import OpenAI from 'openai';
          const client = new OpenAI({ apiKey: 'test-key' });
          console.log('OPENAI:', typeof OpenAI);
          console.log('CLIENT:', typeof client.chat);
        `,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "app.mjs"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: projectRoot }),
        ],
        external: [
          "openai",
          "import-in-the-middle/lib/register.js",
          "dc-polyfill",
        ],
      });

      const result = await bundle.generate({ format: "es" });
      writeFileSync(path.join(tempDir, "bundle.mjs"), result.output[0].code);

      const output = runWithDdTrace();

      expect(output).toContain("OPENAI: function");
      expect(output).toContain("CLIENT: object");
    });

    it("runs @anthropic-ai/sdk with dd-trace initialized", async () => {
      createFiles({
        "app.mjs": `
          import Anthropic from '@anthropic-ai/sdk';
          const client = new Anthropic({ apiKey: 'test-key' });
          console.log('ANTHROPIC:', typeof Anthropic);
          console.log('CLIENT:', typeof client.messages);
        `,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "app.mjs"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: projectRoot }),
        ],
        external: [
          "@anthropic-ai/sdk",
          "import-in-the-middle/lib/register.js",
          "dc-polyfill",
        ],
      });

      const result = await bundle.generate({ format: "es" });
      writeFileSync(path.join(tempDir, "bundle.mjs"), result.output[0].code);

      const output = runWithDdTrace();

      expect(output).toContain("ANTHROPIC: function");
      expect(output).toContain("CLIENT: object");
    });

    it("runs multiple AI SDKs together", async () => {
      createFiles({
        "app.mjs": `
          import { generateText, tool } from 'ai';
          import OpenAI from 'openai';
          import Anthropic from '@anthropic-ai/sdk';
          
          const openai = new OpenAI({ apiKey: 'test-key' });
          const anthropic = new Anthropic({ apiKey: 'test-key' });
          
          console.log('AI_SDK:', typeof generateText, typeof tool);
          console.log('OPENAI:', typeof openai.chat);
          console.log('ANTHROPIC:', typeof anthropic.messages);
        `,
      });

      const bundle = await rollup({
        input: path.join(tempDir, "app.mjs"),
        plugins: [
          rollupPlugin({ debug: false }),
          nodeResolve({ rootDir: projectRoot }),
        ],
        external: [
          "ai",
          "openai",
          "@anthropic-ai/sdk",
          "import-in-the-middle/lib/register.js",
          "dc-polyfill",
        ],
      });

      const result = await bundle.generate({ format: "es" });
      writeFileSync(path.join(tempDir, "bundle.mjs"), result.output[0].code);

      const output = runWithDdTrace();

      expect(output).toContain("AI_SDK: function function");
      expect(output).toContain("OPENAI: object");
      expect(output).toContain("ANTHROPIC: object");
    });
  });

  describe("dd-trace span capture", () => {
    it("captures ai.generateText spans with model info", () => {
      createFiles({
        "capture.mjs": `
          import diagnosticsChannel from 'node:diagnostics_channel';
          import nock from 'nock';
          import { generateText } from 'ai';
          import { createAnthropic } from '@ai-sdk/anthropic';
          
          // Mock Anthropic API
          nock('https://api.anthropic.com')
            .post('/v1/messages')
            .reply(200, {
              id: 'msg_mock',
              type: 'message',
              role: 'assistant',
              content: [{ type: 'text', text: 'hello' }],
              model: 'claude-3-haiku-20240307',
              stop_reason: 'end_turn',
              usage: { input_tokens: 10, output_tokens: 5 }
            });
          
          const spans = [];
          const ch = diagnosticsChannel.channel('dd-trace:span:finish');
          ch.subscribe((msg) => {
            const span = msg?.span || msg;
            if (span?._name?.includes('ai.')) {
              const tags = span._spanContext?._tags || {};
              spans.push({
                name: span._name,
                model: tags['ai.request.model'],
                provider: tags['ai.request.model_provider'],
              });
            }
          });
          
          const anthropic = createAnthropic({ apiKey: 'fake-key' });
          
          try {
            await generateText({
              model: anthropic('claude-3-haiku-20240307'),
              prompt: 'test',
              maxTokens: 5,
            });
            
            await new Promise(r => setTimeout(r, 200));
            
            for (const span of spans) {
              console.log('SPAN:', span.name);
              console.log('MODEL:', span.model);
              console.log('PROVIDER:', span.provider);
            }
            console.log('SPAN_COUNT:', spans.length);
          } catch (err) {
            console.log('ERROR:', err.message);
          }
        `,
      });

      const output = runWithDdTrace("capture.mjs");

      expect(output).toContain("SPAN: ai.generateText");
      expect(output).toContain("MODEL: claude-3-haiku-20240307");
      expect(output).toContain("PROVIDER: anthropic");
      expect(output).toContain("SPAN_COUNT: 2"); // generateText + doGenerate
    });
  });
});
