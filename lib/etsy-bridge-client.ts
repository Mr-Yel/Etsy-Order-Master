import {
  ETSY_BRIDGE_ACTIONS,
  type EtsyBridgeOrderState,
  type EtsyContextGetData,
  type EtsyDomInputSetData,
  type EtsyDomInputSetPayload,
  type EtsyDomSelectSetData,
  type EtsyDomSelectSetPayload,
  type EtsyImagesFetchData,
  type EtsyImagesFetchPayload,
} from "./etsy-bridge-types";
import { sendEtsyMainworldBridgeRequest } from "./etsy-mainworld-client";
import { browser } from "wxt/browser";
import {
  ETSY_IMAGE_FETCH_PROXY_MESSAGE_TYPE,
  type EtsyImageFetchProxyResponse,
} from "./etsy-image-fetch-proxy-types";
import { runWithRetry } from "./limited-jobs.mjs";
import { imgZipLog } from "./img-zip-log";

/** background fetch 最长 30s，消息回传再留 15s 余量，避免永久 pending */
const MESSAGE_HARD_TIMEOUT_MS = 45_000;

/** 任何丢消息都变成 reject，交给上层写进失败清单/报错，不再无限等待 */
function withHardTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  trace: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      imgZipLog("error", "content", "sendMessage 硬超时", {
        trace,
        timeoutMs,
      });
      reject(new Error(`消息回传超时（${Math.round(timeoutMs / 1000)}s）`));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export async function getEtsyBridgeContext(options?: {
  timeoutMs?: number;
}): Promise<EtsyContextGetData> {
  return sendEtsyMainworldBridgeRequest<Record<string, never>, EtsyContextGetData>({
    action: ETSY_BRIDGE_ACTIONS.contextGet,
    payload: {},
    timeoutMs: options?.timeoutMs,
  });
}

export async function setEtsySelectOption(
  payload: EtsyDomSelectSetPayload
): Promise<EtsyDomSelectSetData> {
  return sendEtsyMainworldBridgeRequest<
    EtsyDomSelectSetPayload,
    EtsyDomSelectSetData
  >({
    action: ETSY_BRIDGE_ACTIONS.domSelectSet,
    payload,
  });
}

export async function setEtsyInputValue(
  payload: EtsyDomInputSetPayload
): Promise<EtsyDomInputSetData> {
  return sendEtsyMainworldBridgeRequest<
    EtsyDomInputSetPayload,
    EtsyDomInputSetData
  >({
    action: ETSY_BRIDGE_ACTIONS.domInputSet,
    payload,
  });
}

export async function fetchEtsyImagesAsBase64(
  payload: EtsyImagesFetchPayload
): Promise<EtsyImagesFetchData> {
  const trace = payload.trace ?? "no-trace";
  const urlPreview = payload.urls[0]?.slice(0, 160) ?? "";

  return await runWithRetry(
    async (attempt) => {
      const attemptStartedAt = Date.now();

      try {
        const response = (await withHardTimeout(
          browser.runtime.sendMessage({
            type: ETSY_IMAGE_FETCH_PROXY_MESSAGE_TYPE,
            urls: payload.urls,
            timeoutMs: payload.timeoutMs,
            concurrency: payload.concurrency,
            trace,
          }),
          MESSAGE_HARD_TIMEOUT_MS,
          trace
        )) as EtsyImageFetchProxyResponse | undefined;

        if (response?.success) {
          return response.data;
        }

        throw new Error(response?.error ?? "拉取图片失败");
      } catch (err) {
        imgZipLog("error", "content", "sendMessage reject / 抛错", {
          trace,
          attempt,
          urlPreview,
          elapsedMs: Date.now() - attemptStartedAt,
          name: err instanceof Error ? err.name : undefined,
          message: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
    {
      retries: 2,
      delayMs: 200,
      shouldRetry(error) {
        const message = error instanceof Error ? error.message : String(error);
        const canRetry =
          message.includes("message channel closed") ||
          message.includes("The message port closed") ||
          message.includes("Could not establish connection");

        return canRetry;
      },
    }
  );

}

export async function fetchEtsyImagesAsBase64FromMainWorld(
  payload: EtsyImagesFetchPayload
): Promise<EtsyImagesFetchData> {
  return sendEtsyMainworldBridgeRequest<
    EtsyImagesFetchPayload,
    EtsyImagesFetchData
  >({
    action: ETSY_BRIDGE_ACTIONS.imagesFetchAsBase64,
    payload,
    timeoutMs: 60000,
  });
}

export type { EtsyBridgeOrderState };
