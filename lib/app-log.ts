import { browser } from "wxt/browser";

export const APP_LOG_MESSAGE_TYPE = "QUEUE_APP_LOG" as const;
export const APP_LOG_ENABLED_STORAGE_KEY = "eomAppLogEnabled";
export const APP_LOG_SYSTEM_ORDER_NO = "__SYSTEM__";

const getDefaultAppLogEnabled = (): boolean =>
  import.meta.env.VITE_EOM_APP_LOG_ENABLED !== "false";

export type AppLogEvent = {
  event: string;
  orderNo?: string | number | null;
  source?: string;
  occurredAt?: string;
  data?: Record<string, unknown>;
};

export type AppLogMessage = {
  type: typeof APP_LOG_MESSAGE_TYPE;
  payload: AppLogEvent;
};

export async function isAppLogEnabled(): Promise<boolean> {
  try {
    const result = await browser.storage.local.get(APP_LOG_ENABLED_STORAGE_KEY);
    const stored = result[APP_LOG_ENABLED_STORAGE_KEY];
    if (typeof stored === "boolean") {
      return stored;
    }
  } catch (error) {
    console.warn("[APP-LOG] Failed to read logging toggle", error);
  }
  return getDefaultAppLogEnabled();
}

export async function setAppLogEnabled(enabled: boolean): Promise<void> {
  try {
    await browser.storage.local.set({
      [APP_LOG_ENABLED_STORAGE_KEY]: Boolean(enabled),
    });
  } catch (error) {
    console.warn("[APP-LOG] Failed to persist logging toggle", error);
  }
}

export async function emitAppLog(payload: AppLogEvent): Promise<void> {
  try {
    console.log("[APP-LOG] Dispatching log event", {
      event: payload.event,
      orderNo: payload.orderNo ?? APP_LOG_SYSTEM_ORDER_NO,
      source: payload.source ?? "",
      occurredAt: payload.occurredAt ?? "",
    });
    await browser.runtime.sendMessage({
      type: APP_LOG_MESSAGE_TYPE,
      payload,
    } satisfies AppLogMessage);
    console.log("[APP-LOG] Log event dispatched to background", {
      event: payload.event,
      orderNo: payload.orderNo ?? APP_LOG_SYSTEM_ORDER_NO,
    });
  } catch (error) {
    console.warn("[APP-LOG] Failed to dispatch log payload", error);
  }
}
