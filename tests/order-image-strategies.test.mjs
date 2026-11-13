import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
function loadModule(path, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = { exports: {}, URL, require: name => {
    if (!(name in dependencies)) throw new Error("Unexpected dependency: " + name);
    return dependencies[name];
  } };
  vm.runInNewContext(code, context);
  return context.exports;
}
const strategies = loadModule("../lib/order-image-strategies.ts");
const thumbnailUrl = "https://i.etsystatic.com/ipf/abc/ipf_75x75.123_test.jpg?version=0";
const source = { url: "https://example.com/file.jpg", filename: "file.jpg", mimeType: "image/jpeg", thumbnailUrl };

test("export modal still loads on mount, shows progress and resolves preview through strategy", async () => {
  const { parse, compileScript } = require("vue/compiler-sfc");
  const { descriptor } = parse(fs.readFileSync(new URL("../components/OrderImageExportModal.vue", import.meta.url), "utf8"));
  const script = compileScript(descriptor, { id: "export-regression" });
  const code = ts.transpileModule(script.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mounted = [];
  let requests = 0;
  const vue = { defineComponent: value => value, ref: value => ({ value }), computed: fn => ({ get value() { return fn(); } }), onMounted: fn => mounted.push(fn) };
  const stub = new Proxy({}, { get: () => () => undefined });
  const context = { exports: {}, console, window: { innerWidth: 1400, innerHeight: 900 }, require: name => {
    if (name === "vue") return vue;
    if (name === "@/lib/order-image-strategies") return strategies;
    if (name === "@/composables/useEtsyData") return { getEtsyData: async () => { requests++; return { success: false, error: "context unavailable" }; } };
    return stub;
  } };
  vm.runInNewContext(code, context);
  const state = context.exports.default.setup({}, { expose() {}, emit() {} });
  assert.equal(mounted.length, 1);
  mounted[0]();
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(requests, 1);
  assert.equal(state.loading.value, false);
  assert.equal(state.error.value, "context unavailable");
  state.downloading.value = true;
  state.downloadStage.value = "下载图片 / 转换附件";
  state.downloadTotal.value = 15;
  state.downloadCompleted.value = 4;
  assert.match(state.downloadButtonText.value, /4\/15/);
  state.showAttachmentPreview({ ...source, mimeType: "application/pdf" }, { clientX: 500, clientY: 300 });
  assert.equal(state.previewImage.value.url, thumbnailUrl.replace("75x75", "fullxfull"));
  state.handlePreviewError();
  assert.equal(state.previewImage.value.url, thumbnailUrl);
});

test("format resolution supports MIME, filename and URL including case/query strings", () => {
  for (const [file, expected] of [
    [{ ...source, mimeType: "application/pdf" }, "pdf"],
    [{ ...source, filename: "FILE.PDF" }, "pdf"],
    [{ ...source, url: "https://example.com/FILE.PDF?version=0" }, "pdf"],
    [{ ...source, mimeType: "image/heif" }, "heic"],
    [{ ...source, filename: "file.svg" }, "svg"],
    [source, "raw"],
    [{ ...source, filename: "file.png", mimeType: "image/png" }, "raw"],
  ]) assert.equal(strategies.resolveOrderImageStrategy(file).kind, expected);
});

test("document preview uses full-size JPG, preserves query and thumbnail fallback", () => {
  for (const kind of ["pdf", "heic", "svg"]) {
    const preview = strategies.getOrderImageStrategy(kind).preview({ ...source, url: "https://example.com/file." + kind });
    assert.equal(preview.url, thumbnailUrl.replace("75x75", "fullxfull"));
    assert.equal(preview.fallbackUrl, thumbnailUrl);
  }
  assert.equal(strategies.getOrderImageStrategy("pdf").preview({ ...source, thumbnailUrl: "" }).url, "");
  assert.equal(strategies.getOrderImageStrategy("raw").preview(source).url, source.url);
  assert.throws(() => strategies.getOrderImageStrategy("unregistered"), /未注册/);
});

test("ZIP routes original PNG bytes and all converted pages through format strategy", async () => {
  const fetched = [], converted = [];
  const api = loadModule("../lib/order-image-export.ts", {
    "./order-image-strategies": strategies,
    "./etsy-bridge-client": { fetchEtsyImagesAsBase64: async request => {
      fetched.push(request);
      return { results: [{ success: true, base64: "original-png" }], images: [] };
    } },
    "./image-convert-client": { convertAttachmentToImages: async request => {
      converted.push(request);
      return [{ base64: "page1", ext: "jpg" }, { base64: "page2", ext: "jpg" }];
    } },
  });
  const context = { trace: "batch/j1", timeoutMs: 30000 };
  const original = await api.loadOrderImagePages({ ...source, kind: "raw", size: 1, sourceExt: "png" }, context);
  assert.equal(original[0].ext, "png");
  assert.equal(original[0].base64, "original-png");
  for (const kind of ["pdf", "heic", "svg"]) {
    const pages = await api.loadOrderImagePages({ ...source, kind, size: 1, sourceExt: "jpg" }, context);
    assert.equal(pages.length, 2);
    assert.equal(converted.at(-1).kind, kind);
    assert.equal(converted.at(-1).trace, context.trace);
  }
  assert.equal(fetched.length, 1);
  assert.equal(converted.length, 3);
  await assert.rejects(api.loadOrderImagePages({ ...source, kind: "raw" }, { ...context, signal: { aborted: true } }), /导出已取消/);
  assert.equal(fetched.length, 1);
});

test("ZIP propagates download errors instead of packing an empty file", async () => {
  const api = loadModule("../lib/order-image-export.ts", {
    "./order-image-strategies": strategies,
    "./etsy-bridge-client": { fetchEtsyImagesAsBase64: async () => ({ results: [{ success: false, error: "HTTP 403" }], images: [] }) },
    "./image-convert-client": {},
  });
  await assert.rejects(api.loadOrderImagePages({ ...source, kind: "raw" }, { trace: "error", timeoutMs: 30000 }), /HTTP 403/);
});
