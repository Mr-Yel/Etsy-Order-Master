import {
  APP_LOG_MESSAGE_TYPE,
  type AppLogMessage,
} from "@/lib/app-log";
import {
  enqueueAppLogFromEvent,
  logBackgroundRuntimeStarted,
} from "@/lib/app-log-background";
import { pruneSyncedOrderCache } from "@/lib/kst-sync-cache";
import {
  KST_PROXY_MESSAGE_TYPE,
  type KstProxyRequest,
} from "@/lib/kst-proxy-types";
import { runKstProxyInBackground } from "@/lib/kst-proxy";
import { openLoginPage, handle401 } from "@/lib/auth-manager";
import {
  ETSY_IMAGE_FETCH_PROXY_MESSAGE_TYPE,
  type EtsyImageFetchProxyRequest,
  type EtsyImageFetchProxyResult,
} from "@/lib/etsy-image-fetch-proxy-types";
import { runLimitedJobs } from "@/lib/limited-jobs.mjs";

const DEFAULT_IMAGE_FETCH_TIMEOUT_MS = 30000;
const DEFAULT_IMAGE_FETCH_CONCURRENCY = 4;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function fetchImageAsBase64(
  url: string,
  index: number,
  timeoutMs = DEFAULT_IMAGE_FETCH_TIMEOUT_MS
): Promise<string> {
  console.log("[ETSY-IMAGE-PROXY] Fetch image start", {
    index,
    urlPreview: url.slice(0, 160),
    timeoutMs,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      signal: controller.signal,
    });

    console.log("[ETSY-IMAGE-PROXY] Fetch image response", {
      index,
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get("content-type"),
      contentLength: response.headers.get("content-length"),
    });

    if (!response.ok) {
      throw new Error(`fetch ${response.status} ${response.statusText}`);
    }

    return arrayBufferToBase64(await response.arrayBuffer());
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? `请求超时（${Math.round(timeoutMs / 1000)} 秒）`
        : error instanceof Error
          ? error.message
          : String(error);
    console.error("[ETSY-IMAGE-PROXY] Fetch image failed", {
      index,
      urlPreview: url.slice(0, 160),
      error: message,
    });
    throw new Error(`第 ${index + 1} 张图片下载失败: ${message}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchEtsyImagesAsBase64InBackground(
  urls: string[],
  options?: {
    timeoutMs?: number;
    concurrency?: number;
  }
): Promise<{
  images: string[];
  results: EtsyImageFetchProxyResult[];
  failures: Array<{ index: number; url: string; error: string }>;
}> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_IMAGE_FETCH_TIMEOUT_MS;
  const concurrency = options?.concurrency ?? DEFAULT_IMAGE_FETCH_CONCURRENCY;
  console.log("[ETSY-IMAGE-PROXY] Fetch images request", {
    count: urls.length,
    timeoutMs,
    concurrency,
    urlPreviews: urls.slice(0, 20).map((url, index) => ({
      index,
      urlPreview: url.slice(0, 160),
    })),
  });

  const jobResults = await runLimitedJobs(
    urls,
    (url, index) => fetchImageAsBase64(url, index, timeoutMs),
    {
      concurrency,
      onProgress({ completed, total, index, result }) {
        console.log("[ETSY-IMAGE-PROXY] Fetch images progress", {
          completed,
          total,
          index,
          success: result.success,
        });
      },
    }
  );

  const results: EtsyImageFetchProxyResult[] = jobResults.map((result, index) => {
    const url = urls[index];
    return result.success
      ? {
          success: true,
          index,
          url,
          base64: result.value,
        }
      : {
          success: false,
          index,
          url,
          error: result.error,
        };
  });
  const images = results.map((result) => (result.success ? result.base64 : ""));
  const failures = results
    .filter((result): result is Extract<EtsyImageFetchProxyResult, { success: false }> => !result.success)
    .map((result) => ({
      index: result.index,
      url: result.url,
      error: result.error,
    }));

  console.log("[ETSY-IMAGE-PROXY] Fetch images success", {
    count: images.length,
    failedCount: failures.length,
  });

  return { images, results, failures };
}

export default defineBackground(() => {
  console.log("Hello background!", { id: browser.runtime.id });
  logBackgroundRuntimeStarted();
  void pruneSyncedOrderCache().catch((error) => {
    console.warn("[KST] Failed to prune synced order cache on background start", error);
  });

  browser.runtime.onMessage.addListener(
    (
      message: unknown,
      sender: {
        url?: string;
        origin?: string;
        frameId?: number;
        tab?: { id?: number };
      },
      sendResponse: (response: unknown) => void
    ) => {
      if ((message as { type?: string })?.type === "OPEN_LOGIN_PAGE") {
        void openLoginPage();
        return false;
      }

      if ((message as { type?: string })?.type === APP_LOG_MESSAGE_TYPE) {
        const appLogMessage = message as AppLogMessage;
        void enqueueAppLogFromEvent(appLogMessage.payload, sender);
        sendResponse({ success: true as const });
        return false;
      }

      if ((message as { type?: string })?.type === ETSY_IMAGE_FETCH_PROXY_MESSAGE_TYPE) {
        const req = message as EtsyImageFetchProxyRequest;
        fetchEtsyImagesAsBase64InBackground(req.urls, {
          timeoutMs: req.timeoutMs,
          concurrency: req.concurrency,
        })
          .then((data) => sendResponse({ success: true as const, data }))
          .catch((err: Error) =>
            sendResponse({
              success: false as const,
              error: err?.message ?? String(err),
            })
          );
        return true;
      }

      if ((message as { type?: string })?.type === KST_PROXY_MESSAGE_TYPE) {
        const req = message as KstProxyRequest & { type: string };
        runKstProxyInBackground({
          path: req.path,
          method: req.method,
          headers: req.headers,
          query: req.query,
          body: req.body,
          formFile: req.formFile,
          formFields: req.formFields,
          token: req.token,
        })
          .then(async (data) => {
            const body = data as { code?: number; msg?: string };
            if (body?.code === 401) {
              console.log("[KST] 检测到 401，执行 handle401");
              const result = await handle401();
              console.log("[KST] handle401 结果", {
                autoLoggedIn: result.autoLoggedIn,
                errorMessage: result.errorMessage,
              });
              sendResponse({
                success: false as const,
                error: result.errorMessage ?? body?.msg ?? "登录已过期",
                code: 401,
                autoLoggedIn: result.autoLoggedIn,
              });
              return;
            }
            sendResponse({ success: true as const, data });
          })
          .catch((err: Error) =>
            sendResponse({
              success: false as const,
              error: err?.message ?? String(err),
            })
          );
        return true;
      }

      return false;
    }
  );
});

