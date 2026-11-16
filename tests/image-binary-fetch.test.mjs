import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import JSZip from 'jszip';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(new URL('../lib/image-binary-fetch.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = { exports: {}, Uint8Array };
vm.runInNewContext(code, context);
const { readImageBytes, MAX_IMAGE_BYTES } = context.exports;

test('50 MiB original survives binary transfer and ZIP without changing bytes', async () => {
  const input = new Uint8Array(MAX_IMAGE_BYTES);
  input[0] = 137;
  input[input.length - 1] = 255;
  const buffer = await readImageBytes(new Response(input));
  const transferred = structuredClone(buffer, { transfer: [buffer] });
  assert.equal(buffer.byteLength, 0);
  const zip = new JSZip();
  zip.file('5VZZ2F/4230714649_1_附件1.png', new Uint8Array(transferred));
  const packed = await zip.generateAsync({ type: 'uint8array', compression: 'STORE', streamFiles: true });
  const restored = await JSZip.loadAsync(packed);
  assert.deepEqual(await restored.file('5VZZ2F/4230714649_1_附件1.png').async('uint8array'), input);
});

test('oversized declared response is cancelled before reading', async () => {
  let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  await assert.rejects(readImageBytes(new Response(body, { headers: { 'Content-Length': String(MAX_IMAGE_BYTES + 1) } })), /50 MiB/);
  assert.equal(cancelled, true);
});

test('missing or inaccurate Content-Length cannot bypass streamed byte limit', async () => {
  for (const headers of [{}, { 'Content-Length': '1' }]) {
    let cancelled = false;
    let count = 0;
    const body = new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(count++ === 0 ? MAX_IMAGE_BYTES : 1));
      },
      cancel() { cancelled = true; },
    });
    await assert.rejects(readImageBytes(new Response(body, { headers })), /50 MiB/);
    assert.equal(cancelled, true);
  }
});

test('empty, broken and HTTP error responses fail instead of creating ZIP entries', async () => {
  await assert.rejects(readImageBytes(new Response(new Uint8Array())), /内容为空/);
  await assert.rejects(readImageBytes(new Response('', { status: 403 })), /HTTP 403/);
  const body = new ReadableStream({ start(controller) { controller.error(new Error('connection lost')); } });
  await assert.rejects(readImageBytes(new Response(body)), /connection lost/);
});

test('extension bridge rejects foreign parents and arbitrary download hosts, transfers CDN bytes', async () => {
  let handler;
  let downloads = 0;
  const parent = {};
  const bridgeCode = ts.transpileModule(fs.readFileSync(new URL('../entrypoints/image-transfer/main.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(bridgeCode, {
    exports: {}, URL, AbortController, setTimeout, clearTimeout,
    window: { parent, addEventListener(_type, fn) { handler = fn; } },
    require() { return context.exports; },
    async fetch() { downloads++; return new Response(new Uint8Array([137, 80, 78, 71])); },
  });
  const invoke = (origin, url, source = parent) => {
    let result;
    let transferred;
    const port = { start() {}, close() {}, postMessage(value, transfer) { result = value; transferred = transfer; } };
    handler({ origin, source, data: { type: context.exports.IMAGE_BINARY_REQUEST, url }, ports: [port] });
    return { get result() { return result; }, get transferred() { return transferred; } };
  };
  assert.equal(invoke('https://evil.test', 'https://i.etsystatic.com/a.png').result, undefined);
  assert.equal(invoke('null', 'https://i.etsystatic.com/a.png').result, undefined);
  assert.equal(invoke('https://www.etsy.com', 'https://i.etsystatic.com/a.png', {}).result, undefined);
  const denied = invoke('https://www.etsy.com', 'https://evil.test/a.png');
  assert.match(denied.result.error, /域名/);
  assert.equal(downloads, 0);
  const allowed = invoke('https://www.etsy.com', 'https://i.etsystatic.com/a.png');
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(Array.from(new Uint8Array(allowed.result.buffer)), [137, 80, 78, 71]);
  assert.equal(allowed.transferred[0], allowed.result.buffer);
  assert.equal(downloads, 1);
});
