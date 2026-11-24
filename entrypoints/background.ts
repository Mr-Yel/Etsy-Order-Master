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
import { handleKstProxyPortConnection } from "@/lib/kst-proxy-port";
import { runKstProxyInBackground } from "@/lib/kst-proxy";
import { openLoginPage, handle401 } from "@/lib/auth-manager";
import {
  ETSY_IMAGE_FETCH_PROXY_MESSAGE_TYPE,
  type EtsyImageFetchProxyRequest,
  type EtsyImageFetchProxyResult,
} from "@/lib/etsy-image-fetch-proxy-types";
import { runLimitedJobs } from "@/lib/limited-jobs.mjs";
import { imgZipLog } from "@/lib/img-zip-log";
import {
  CLOSE_OFFSCREEN_MESSAGE_TYPE,
  CONVERT_OFFSCREEN_MESSAGE_TYPE,
  CONVERT_REQUEST_MESSAGE_TYPE,
  CONVERT_MESSAGE_TIMEOUT_MS,
  ENSURE_OFFSCREEN_MESSAGE_TYPE,
  type ConvertRequestMessage,
  type ConvertResponse,
  type EnsureOffscreenResponse,
} from "@/lib/image-convert-types";
import {
  closeOffscreenDocument,
  ensureOffscreenDocument,
} from "@/lib/offscreen-host";

const DEFAULT_IMAGE_FETCH_TIMEOUT_MS = 30000;
const DEFAULT_IMAGE_FETCH_CONCURRENCY = 4;
/** 单条 runtime 消息的安全上限：实测 45MB 会抛 Message length exceeded，6MB 正常 */
const MAX_MESSAGE_PAYLOAD_CHARS = 8_000_000;
/** 排查用：每次 service worker 启动都会重新生成，日志里值变了就说明 SW 被回收/重启过 */
const SW_BOOT_ID = `sw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0;i < bytes.length;i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function fetchImageAsBase64(
  url: string,
  index: number,
  timeoutMs = DEFAULT_IMAGE_FETCH_TIMEOUT_MS,
  trace = "no-trace"
): Promise<string> {
  const startedAt = Date.now();
  const urlPreview = url.slice(0, 160);
  /** 排查用：记录卡在哪一阶段，catch / 心跳日志都会带上 */
  let phase = "init";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    imgZipLog("error", "sw", "触发 AbortController 超时", {
      swBootId: SW_BOOT_ID,
      trace,
      index,
      urlPreview,
      phase,
      elapsedMs: Date.now() - startedAt,
      timeoutMs,
    });
    controller.abort();
  }, timeoutMs);

  try {
    phase = "fetch-headers";
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      signal: controller.signal,
    });

    if (!response.ok) {
      phase = "response-not-ok";
      throw new Error(`fetch ${response.status} ${response.statusText}`);
    }

    phase = "read-body";

    const buffer = await response.arrayBuffer();

    phase = "to-base64";

    const base64 = arrayBufferToBase64(buffer);

    phase = "done";

    return base64;
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? `请求超时（${Math.round(timeoutMs / 1000)} 秒）`
        : error instanceof Error
          ? error.message
          : String(error);

    imgZipLog("error", "sw", "fetch 失败", {
      swBootId: SW_BOOT_ID,
      trace,
      index,
      urlPreview,
      phase,
      elapsedMs: Date.now() - startedAt,
      errorName: error instanceof Error ? error.name : undefined,
      message,
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
    trace?: string;
  }
): Promise<{
  images: string[];
  results: EtsyImageFetchProxyResult[];
  failures: Array<{ index: number; url: string; error: string }>;
}> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_IMAGE_FETCH_TIMEOUT_MS;
  const concurrency = options?.concurrency ?? DEFAULT_IMAGE_FETCH_CONCURRENCY;
  const trace = options?.trace ?? "no-trace";

  const jobResults = await runLimitedJobs(
    urls,
    async (url, index) => {

      return await fetchImageAsBase64(url, index, timeoutMs, trace);

    },
    {
      concurrency,

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

  return { images, results, failures };

}

export default defineBackground(() => {

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
      // runtime.sendMessage 会广播给扩展内所有上下文（SW 自己也在内）。
      // 发给 offscreen 的消息必须让 SW 立刻退出，否则会抢答或空转保持通道。
      if ((message as { target?: string })?.target === "offscreen") {
        return false;
      }

      if ((message as { type?: string })?.type === "OPEN_LOGIN_PAGE") {
        void openLoginPage();
        return false;
      }

      if (
        (message as { type?: string })?.type === ENSURE_OFFSCREEN_MESSAGE_TYPE
      ) {

        // 用 then(onFulfilled, onRejected) 分离，避免 onFulfilled 里的
        // sendResponse 抛错后再次进入 onRejected 触发二次响应
        void ensureOffscreenDocument().then(
          (path) => {
            const response: EnsureOffscreenResponse = { ok: true, path };
            try {
              sendResponse(response);

            } catch (error) {
              imgZipLog("error", "sw", "offscreen 就绪响应发送失败", {
                swBootId: SW_BOOT_ID,
                message: error instanceof Error ? error.message : String(error),
              });
            }
          },
          (error: unknown) => {
            const messageText =
              error instanceof Error ? error.message : String(error);
            imgZipLog("error", "sw", "offscreen 创建失败", {
              swBootId: SW_BOOT_ID,
              message: messageText,
            });
            const response: EnsureOffscreenResponse = {
              ok: false,
              error: messageText,
            };
            try {
              sendResponse(response);
            } catch (sendError) {
              imgZipLog("error", "sw", "offscreen 失败响应发送失败", {
                swBootId: SW_BOOT_ID,
                message:
                  sendError instanceof Error
                    ? sendError.message
                    : String(sendError),
              });
            }
          }
        );
        return true;
      }

      // content script 不能直连 offscreen，必须由 SW 用 runtime.sendMessage 中继。
      // offscreen 所有分支都是同步 ack，长任务走「start ack + status 轮询」，
      // 因此这里只保留毫秒级硬超时，绝不把 message channel 挂在长任务上。
      if (
        (message as { type?: string })?.type === CONVERT_REQUEST_MESSAGE_TYPE
      ) {
        const req = message as ConvertRequestMessage;
        const receivedAt = Date.now();
        const timeoutMs = CONVERT_MESSAGE_TIMEOUT_MS;

        let timer: ReturnType<typeof setTimeout> | undefined;
        void Promise.race([
          browser.runtime.sendMessage({
            ...req,
            type: CONVERT_OFFSCREEN_MESSAGE_TYPE,
            target: "offscreen",
          }) as Promise<ConvertResponse | undefined>,
          new Promise<undefined>((resolve) => {
            timer = setTimeout(() => resolve(undefined), timeoutMs);
          }),
        ])
          .then((response) => {

            sendResponse(
              response ?? {
                ok: false as const,
                error: `offscreen 同步响应超时（${Math.round(timeoutMs / 1000)}s，action=${req.action}）`,
              }
            );
          })
          .catch((error: unknown) => {
            const text =
              error instanceof Error ? error.message : String(error);
            imgZipLog("error", "sw", "转换请求中继失败", {
              swBootId: SW_BOOT_ID,
              action: req.action,
              jobId: req.jobId,
              message: text,
              elapsedMs: Date.now() - receivedAt,
            });
            sendResponse({ ok: false as const, error: text });
          })
          .finally(() => clearTimeout(timer));
        return true;
      }

      if (
        (message as { type?: string })?.type === CLOSE_OFFSCREEN_MESSAGE_TYPE
      ) {
        void closeOffscreenDocument();
        sendResponse({ ok: true });
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
        const trace = req.trace ?? "no-trace";
        const receivedAt = Date.now();

        fetchEtsyImagesAsBase64InBackground(req.urls, {
          timeoutMs: req.timeoutMs,
          concurrency: req.concurrency,
          trace,
        }).then(
          (data) => {
            const totalPayloadChars = data.images.reduce(
              (sum, image) => sum + image.length,
              0
            );

            if (totalPayloadChars > MAX_MESSAGE_PAYLOAD_CHARS) {
              const errorText = `附件过大（约 ${(totalPayloadChars / 1024 / 1024).toFixed(1)} MiB），已跳过以避免消息通道超限`;
              imgZipLog("error", "sw", "消息体超限，改为失败响应", {
                swBootId: SW_BOOT_ID,
                trace,
                totalPayloadChars,
                errorText,
              });
              try {
                sendResponse({ success: false as const, error: errorText });
              } catch (sendError) {
                imgZipLog("error", "sw", "超限失败响应发送失败", {
                  swBootId: SW_BOOT_ID,
                  trace,
                  message:
                    sendError instanceof Error
                      ? sendError.message
                      : String(sendError),
                });
              }
              return;
            }
            try {
              sendResponse({ success: true as const, data });

            } catch (sendError) {
              // 通道已失效时绝不再补发第二条响应，交给前端超时兜底
              imgZipLog("error", "sw", "sendResponse(success) 抛错，放弃二次响应", {
                swBootId: SW_BOOT_ID,
                trace,
                message:
                  sendError instanceof Error
                    ? sendError.message
                    : String(sendError),
              });
            }
          },
          (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            imgZipLog("error", "sw", "链路异常，准备 sendResponse(error)", {
              swBootId: SW_BOOT_ID,
              trace,
              elapsedMs: Date.now() - receivedAt,
              error: message,
            });
            try {
              sendResponse({ success: false as const, error: message });

            } catch (sendError) {
              imgZipLog("error", "sw", "sendResponse(error) 抛错", {
                swBootId: SW_BOOT_ID,
                trace,
                message:
                  sendError instanceof Error
                    ? sendError.message
                    : String(sendError),
              });
            }
          }
        );

        return true;
      }

      if ((message as { type?: string })?.type === KST_PROXY_MESSAGE_TYPE) {
        const req = message as KstProxyRequest & { type: string };
        // 写请求（POST/PUT/DELETE）数量少、排障价值高，打日志便于确认是否真的发出
        const method = (req.method ?? "GET").toUpperCase();
        const shouldLog = method !== "GET";
        if (shouldLog) {
          console.log("[KST-PROXY] 收到写请求", { method, path: req.path });
        }
        const handleProxyUnauthorized = async (message?: string) => {
          console.log("[KST] 检测到 401，执行 handle401");
          const result = await handle401();
          console.log("[KST] handle401 结果", {
            autoLoggedIn: result.autoLoggedIn,
            errorMessage: result.errorMessage,
          });
          sendResponse({
            success: false as const,
            error: result.errorMessage ?? message ?? "登录已过期",
            code: 401,
            autoLoggedIn: result.autoLoggedIn,
            reauthOn401: true,
          });
        };
        runKstProxyInBackground({
          path: req.path,
          baseUrl: req.baseUrl,
          method: req.method,
          headers: req.headers,
          query: req.query,
          body: req.body,
          formFile: req.formFile,
          formFields: req.formFields,
          token: req.token,
          reauthOn401: req.reauthOn401,
        })
          .then(async (data) => {
            const body = data as { code?: number; msg?: string };
            if (shouldLog) {
              console.log("[KST-PROXY] 写请求响应", {
                method,
                path: req.path,
                code: body?.code,
                msg: body?.msg,
              });
            }
            if (body?.code === 401 && req.reauthOn401 !== false) {
              await handleProxyUnauthorized(body?.msg);
              return;
            }
            sendResponse({ success: true as const, data });
          })
          .catch(async (err: Error & { status?: number; code?: number; type?: string }) => {
            console.warn("[KST-PROXY] 请求失败", {
              method,
              path: req.path,
              error: err?.message ?? String(err),
            });
            const status = err?.status ?? err?.code;
            if (status === 401 && req.reauthOn401 !== false) {
              await handleProxyUnauthorized(err?.message);
              return;
            }
            sendResponse({
              success: false as const,
              error: err?.message ?? String(err),
              code: status,
              type: err?.type,
              reauthOn401: req.reauthOn401 !== false,
            });
          });
        return true;
      }

      return false;
    }
  );

  browser.runtime.onConnect.addListener((port) => {
    handleKstProxyPortConnection(port, {
      async onUnauthorized(body) {
        console.log("[KST] 检测到 401，执行 handle401");
        const result = await handle401();
        console.log("[KST] handle401 结果", {
          autoLoggedIn: result.autoLoggedIn,
          errorMessage: result.errorMessage,
        });
        return {
          success: false,
          error: result.errorMessage ?? body?.msg ?? "登录已过期",
          code: 401,
          autoLoggedIn: result.autoLoggedIn,
          reauthOn401: true,
        };
      },
    });
  });
});
