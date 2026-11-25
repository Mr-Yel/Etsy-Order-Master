import { getToken } from "@/lib/auth-manager";
import { runKstProxyInBackground } from "@/lib/kst-proxy";
import { IS_TEST_BUILD } from "@/lib/runtime-identity";
import type {
  EtsyOrderSyncDispatchResult,
  EtsyOrderSyncEvent,
} from "@/lib/etsy-order-sync-types";
import {
  buildEtsyOrderSyncBffRequest,
  evaluateEtsyOrderSyncBffResponse,
  resolveEtsyOrderSyncMode,
} from "@/lib/etsy-order-sync-utils.mjs";

export function getEtsyOrderSyncMode(): "observe" | "submit" {
  return resolveEtsyOrderSyncMode(
    IS_TEST_BUILD,
    import.meta.env.VITE_ETSY_ORDER_SYNC_MODE
  );
}

export async function dispatchEtsyOrderSyncEvent(
  event: EtsyOrderSyncEvent
): Promise<EtsyOrderSyncDispatchResult> {
  const mode = getEtsyOrderSyncMode();

  if (mode === "observe") {
    console.info("[ETSY-ORDER-SYNC] observed event", event);
    return { accepted: true, mode };
  }

  const bffKey = import.meta.env.VITE_ETSY_ORDER_SYNC_BFF_KEY?.trim();
  if (!bffKey) {
    return {
      accepted: false,
      mode,
      error: "缺少 Etsy 订单同步 BFF Key：VITE_ETSY_ORDER_SYNC_BFF_KEY",
    };
  }

  const request = buildEtsyOrderSyncBffRequest(event);
  if (!request) {
    return {
      accepted: false,
      mode,
      error: "无法生成 Etsy 订单同步 BFF 请求",
    };
  }

  const token = await getToken();
  if (!token) {
    return {
      accepted: false,
      mode,
      error: "未登录 KST，无法提交 Etsy 订单同步事件",
    };
  }

  try {
    const response = await runKstProxyInBackground({
      baseUrl: import.meta.env.VITE_POD_API_BASE_URL,
      path: request.path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bff-key": bffKey,
      },
      body: request.body,
      token,
      reauthOn401: false,
    });
    const result = evaluateEtsyOrderSyncBffResponse(response);
    if (!result.accepted) {
      return {
        accepted: false,
        mode,
        error: `Etsy 订单同步 BFF 未受理事件：${result.error}`,
      };
    }

    return {
      accepted: true,
      mode,
      jobId: result.jobId,
      acceptedCount: result.acceptedCount,
    };
  } catch (error) {
    return {
      accepted: false,
      mode,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
