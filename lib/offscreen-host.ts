import { browser } from "wxt/browser";
import { imgZipLog } from "./img-zip-log";
import {
  CONVERT_PING_MESSAGE_TYPE,
  type OffscreenMessage,
} from "./image-convert-types";

/** WXT 会把 entrypoints/offscreen/index.html 构建为扩展根目录下的 offscreen.html */
export const OFFSCREEN_DOCUMENT_PATH = "/offscreen.html";

const PING_TIMEOUT_MS = 3000;
const PING_RETRY_COUNT = 10;
const PING_RETRY_DELAY_MS = 300;

type OffscreenApi = {
  Reason?: {
    DOM_PARSER?: string;
    BLOBS?: string;
    WORKERS?: string;
  };
  createDocument: (options: {
    url: string;
    reasons: string[];
    justification: string;
  }) => Promise<void>;
  closeDocument: () => Promise<void>;
};

function getOffscreenApi(): OffscreenApi | null {
  const chromeGlobal = (
    globalThis as unknown as {
      chrome?: { offscreen?: OffscreenApi };
    }
  ).chrome;
  return chromeGlobal?.offscreen ?? null;
}

let creating: Promise<void> | null = null;

type ContextsApi = {
  getContexts?: (filter: {
    contextTypes: string[];
    documentUrls?: string[];
  }) => Promise<Array<unknown>>;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("offscreen 探活超时")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** 关键：只确认「文档存在」不够，必须确认脚本已注册 onMessage 监听 */
async function pingOffscreen(): Promise<boolean> {
  try {
    const message: OffscreenMessage = {
      type: CONVERT_PING_MESSAGE_TYPE,
      target: "offscreen",
    };
    const response = (await withTimeout(
      browser.runtime.sendMessage(message),
      PING_TIMEOUT_MS
    )) as { ok?: boolean; build?: string } | undefined;
    return response?.ok === true;
  } catch {
    return false;
  }
}

async function hasOffscreenDocument(): Promise<boolean> {
  const runtimeFromPolyfill = browser.runtime as ContextsApi;
  const runtimeFromChrome = (
    globalThis as unknown as {
      chrome?: { runtime?: ContextsApi };
    }
  ).chrome?.runtime;
  const contextsApi =
    typeof runtimeFromPolyfill.getContexts === "function"
      ? runtimeFromPolyfill
      : typeof runtimeFromChrome?.getContexts === "function"
        ? runtimeFromChrome
        : null;
  if (contextsApi?.getContexts) {
    const contexts = await contextsApi.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
    });
    return contexts.length > 0;
  }
  // 兜底：offscreen document 会作为一个 client 出现在 SW 的 clients 列表里
  const clientList = await (
    globalThis as unknown as {
      clients?: { matchAll: () => Promise<Array<{ url: string }>> };
    }
  ).clients?.matchAll?.();
  if (!clientList) return false;
  return clientList.some((client) => client.url.includes("offscreen.html"));
}

async function createOffscreenDocument(): Promise<void> {
  if (creating) return creating;
  creating = (async () => {
    const api = getOffscreenApi();
    if (!api) throw new Error("当前浏览器不支持 chrome.offscreen API");
    // pdf.js 需要 new Worker，必须声明 WORKERS
    const reasons = [
      api.Reason?.DOM_PARSER ?? "DOM_PARSER",
      api.Reason?.BLOBS ?? "BLOBS",
      api.Reason?.WORKERS ?? "WORKERS",
    ];

    await api.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons,
      justification: "把订单 PDF / HEIC / SVG 附件栅格化为图片后导出",
    });

  })().finally(() => {
    creating = null;
  });
  return creating;
}

export async function ensureOffscreenDocument(): Promise<string> {
  const hasDocument = await hasOffscreenDocument();
  if (hasDocument && (await pingOffscreen())) {

    return OFFSCREEN_DOCUMENT_PATH;
  }

  if (hasDocument) {
    imgZipLog("warn", "sw", "offscreen 探活失败，关闭并重建", {
      path: OFFSCREEN_DOCUMENT_PATH,
    });
  }
  const api = getOffscreenApi();
  if (api && (await hasOffscreenDocument())) {
    try {
      await api.closeDocument();
    } catch (error) {
      imgZipLog("warn", "sw", "关闭旧 offscreen document 失败", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  await createOffscreenDocument();

  for (let i = 0;i < PING_RETRY_COUNT;i += 1) {
    if (await pingOffscreen()) {

      return OFFSCREEN_DOCUMENT_PATH;
    }
    await wait(PING_RETRY_DELAY_MS);
  }
  throw new Error(
    "offscreen 转换页脚本未就绪（探活无响应），请检查 offscreen.html 控制台"
  );
}

export async function closeOffscreenDocument(): Promise<void> {
  const api = getOffscreenApi();
  if (!api) return;
  if (!(await hasOffscreenDocument())) return;
  try {
    await api.closeDocument();

  } catch (error) {
    imgZipLog("warn", "sw", "关闭 offscreen document 失败", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
