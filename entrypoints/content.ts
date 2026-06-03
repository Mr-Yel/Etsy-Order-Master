import { createApp } from "vue";
import JSZip from "jszip";
import ContentScriptWrapper from "@/components/ContentScriptWrapper.vue";
import { emitAppLog } from "@/lib/app-log";
import {
  ETSY_BRIDGE_EVENT_TYPE,
  type EtsyContextGetData,
} from "@/lib/etsy-bridge-types";
import { fetchEtsyImagesAsBase64 } from "@/lib/etsy-bridge-client";
import {
  ETSY_CONTENT_BRIDGE_ACTIONS,
  ETSY_CONTENT_BRIDGE_MESSAGE_TYPE,
  type EtsyContentBridgeRequest,
  type EtsyContentBridgeResponse,
  type EtsyContentOrdersListPayload,
  type EtsyConversationImagesCollectData,
  type EtsyImagesZipDownloadPayload,
} from "@/lib/etsy-content-bridge-types";
import type { EtsyBuyer, EtsyOrder } from "@/types/etsy-order";
import {
  fetchOrderList,
  getOrderListBaseParams,
} from "@/composables/useFetchOrderList";
import { mapOrdersToTableRows, type ExportTableRow } from "@/utils/orders-mapping";
import { getAuthDebugSnapshot, isLoggedIn } from "@/lib/auth-manager";
import { syncOrdersToKst } from "@/lib/kst-order-sync";
import { getNotyf } from "@/lib/notyf";
import {
  type ResolvedOrderSyncStatus,
  resolveOrderSyncStatus,
} from "@/lib/kst-sync-status";
import { getExportOrderId } from "@/utils/order-id-rules";
import {
  fetchPlatformOrderDetailViaProxy,
  fetchPlatformOrdersListViaProxy,
  updatePlatformOrderShipByDateViaProxy,
} from "@/api/kst-platform-orders";
import {
  appendShipByDateLog,
  formatChinaDateTimeFromUnixSeconds,
} from "@/lib/kst-ship-by-date-sync-utils.mjs";

/** 将订单号数组格式化为简短预览，用于错误提示（最多展示前几条 + 等N条） */
function formatOrderIdsPreview(
  orderIds: (string | number)[],
  maxShow = 5
): string {
  if (!orderIds.length) return "";
  const parts = orderIds.slice(0, maxShow).map((id) => String(id));
  const preview = parts.join("、");
  return orderIds.length > maxShow ? `${preview} 等${orderIds.length}条` : preview;
}

function emitLogsForOrderIds(
  orderIds: Array<string | number | null | undefined>,
  event: string,
  data: Record<string, unknown>,
  source = "auto_move_orders"
): void {
  const normalizedOrderIds = Array.from(
    new Set(
      orderIds
        .map((orderId) => String(orderId ?? "").trim())
        .filter((orderId) => orderId.length > 0)
    )
  );
  const occurredAt = new Date().toISOString();

  normalizedOrderIds.forEach((orderId) => {
    void emitAppLog({
      event,
      orderNo: orderId,
      source,
      occurredAt,
      data,
    });
  });
}

/**
 * 脚本注入状态管理
 * 用于跟踪已注入的脚本，避免重复注入
 */
const scriptInjectionState = {
  pageInject: {
    injected: false,
    promise: null as Promise<void> | null,
  },
};

/**
 * 注入脚本到页面主世界
 * @param scriptPath 脚本路径
 * @returns Promise<void>
 */
function injectScript(scriptPath: string): Promise<void> {
  // 如果是 page-inject.js，使用状态管理
  if (scriptPath === "page-inject.js") {
    // 如果已经注入，返回已存在的 Promise
    if (scriptInjectionState.pageInject.injected && scriptInjectionState.pageInject.promise) {
      return scriptInjectionState.pageInject.promise;
    }

    // 检查脚本是否已经注入（通过 DOM）
    const scriptId = `injected-script-${scriptPath}`;
    if (document.getElementById(scriptId)) {
      console.log(`✅ [隔离世界] 脚本 ${scriptPath} 已存在，跳过注入`);
      scriptInjectionState.pageInject.injected = true;
      const resolvedPromise = Promise.resolve();
      scriptInjectionState.pageInject.promise = resolvedPromise;
      return resolvedPromise;
    }

    // 创建新的注入 Promise
    const injectionPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = browser.runtime.getURL(scriptPath as any);
      script.onload = function () {
        console.log(`✅ [隔离世界] 脚本 ${scriptPath} 注入成功`);
        scriptInjectionState.pageInject.injected = true;
        resolve();
      };
      script.onerror = function () {
        console.error(`❌ [隔离世界] 脚本 ${scriptPath} 注入失败`);
        scriptInjectionState.pageInject.injected = false;
        scriptInjectionState.pageInject.promise = null;
        reject(new Error(`脚本 ${scriptPath} 注入失败`));
      };
      (document.head || document.documentElement).appendChild(script);
    });

    // 保存 Promise 到状态
    scriptInjectionState.pageInject.promise = injectionPromise;
    return injectionPromise;
  }

  // 其他脚本的注入逻辑（保持向后兼容）
  return new Promise((resolve, reject) => {
    const scriptId = `injected-script-${scriptPath}`;
    if (document.getElementById(scriptId)) {
      console.log(`✅ [隔离世界] 脚本 ${scriptPath} 已存在，跳过注入`);
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = browser.runtime.getURL(scriptPath as any);
    script.onload = function () {
      console.log(`✅ [隔离世界] 脚本 ${scriptPath} 注入成功`);
      resolve();
    };
    script.onerror = function () {
      console.error(`❌ [隔离世界] 脚本 ${scriptPath} 注入失败`);
      reject(new Error(`脚本 ${scriptPath} 注入失败`));
    };
    (document.head || document.documentElement).appendChild(script);
  });
}

/**
 * 初始化脚本注入
 * 在 content script 启动时立即注入必要的脚本
 */
async function initializeScriptInjection(): Promise<void> {
  try {
    // 注入 page-inject.js 到主世界
    // 这个脚本提供以下功能：
    // 1. 获取 Etsy 数据（get-etsy-data）
    // 2. 修改 select 选项（change-select-option）
    // 3. 修改 input 值（change-input-value）
    await injectScript("page-inject.js");
    console.log("✅ [隔离世界] 脚本注入初始化完成");
  } catch (error) {
    console.error("❌ [隔离世界] 脚本注入初始化失败:", error);
    // 不抛出错误，允许后续功能降级处理
  }
}

import {
  type OrderState,
  ensureEtsyContextFromMainWorld,
} from "@/lib/etsy-context";

/**
 * 通过统一的 EtsyContext 服务获取 Etsy 数据（shopId 和 orderStates）
 * 保持原有返回结构，方便现有调用方复用
 */
async function getEtsyDataFromMainWorld(): Promise<{
  success: boolean;
  shopId?: number;
  orderStates?: OrderState[];
  error?: string;
}> {
  try {
    // 确保注入脚本已加载（使用状态管理，避免重复注入）
    await injectScript("page-inject.js");

    const result = await ensureEtsyContextFromMainWorld();
    if (result.status !== "ready" || !result.context) {
      return {
        success: false,
        error: result.error || "无法获取 Etsy 数据",
      };
    }

    const { shopId, orderStates } = result.context;
    if (shopId == null) {
      return {
        success: false,
        error: "无法获取店铺 ID",
      };
    }

    console.log("✅ [隔离世界] 成功从主世界获取 Etsy 数据", {
      shopId,
      orderStatesCount: orderStates?.length ?? 0,
    });

    return {
      success: true,
      shopId,
      orderStates,
    };
  } catch (error) {
    console.error("❌ [隔离世界] 获取 Etsy 数据时发生错误:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "无法获取 Etsy 数据",
    };
  }
}

function collectConversationImagesFromPage(): EtsyConversationImagesCollectData {
  const container =
    document.querySelector("#msg-list-container") ??
    document.querySelector(".msg-list-container");

  if (!container) {
    throw new Error("未找到 msg-list-container，请确保在聊天页面打开");
  }

  const links = container.querySelectorAll("a");
  const urlSet = new Set<string>();
  links.forEach((a) => {
    const href = (a.getAttribute("href") ?? (a as HTMLAnchorElement).href)?.trim();
    if (href) urlSet.add(href);
  });

  return {
    urls: Array.from(urlSet),
    orderNumber: getOrderNumberFromPage(),
  };
}

function getOrderNumberFromPage(): string {
  const buyerInfo = document.querySelector(".buyer-info");
  if (!buyerInfo) return "";

  const listUnstyled = buyerInfo.querySelector(".wt-list-unstyled");
  if (!listUnstyled) return "";

  const truncateEl = listUnstyled.querySelector(".wt-text-truncate");
  return truncateEl ? (truncateEl.textContent ?? "").trim() : "";
}

async function buildImagesZipData(
  urls: string[],
  orderNumber: string
): Promise<{ zipBase64: string; filename: string }> {
  if (!urls.length) {
    throw new Error("没有选中图片");
  }

  const { images: imagesBase64 } = await fetchEtsyImagesAsBase64({ urls });

  function getExt(url: string): string {
    try {
      const pathname = new URL(url, "https://x").pathname;
      const match = pathname.match(/\.(jpe?g|png|gif|webp|bmp)(\?|$)/i);
      return match ? match[1].toLowerCase() : "jpg";
    } catch {
      return "jpg";
    }
  }

  const zip = new JSZip();
  for (let i = 0; i < imagesBase64.length; i++) {
    const ext = getExt(urls[i]);
    zip.file(`image_${i + 1}.${ext}`, imagesBase64[i], { base64: true });
  }

  return {
    zipBase64: await zip.generateAsync({ type: "base64" }),
    filename: (orderNumber || "images").replace(/[/\\?*:|"]/g, "_") + ".zip",
  };
}

async function handleEtsyContentBridgeRequest(
  message: EtsyContentBridgeRequest
): Promise<EtsyContentBridgeResponse<unknown>> {
  try {
    if (message.action === ETSY_CONTENT_BRIDGE_ACTIONS.contextGet) {
      const result = await ensureEtsyContextFromMainWorld();
      if (result.status !== "ready" || !result.context) {
        return {
          success: false,
          error: {
            code: "ETSY_CONTEXT_UNAVAILABLE",
            message: result.error || "无法获取 Etsy 数据",
          },
        };
      }

      return {
        success: true,
        data: {
          raw: result.context.raw,
          shopId: result.context.shopId,
          orderStates: result.context.orderStates,
        } satisfies EtsyContextGetData,
      };
    }

    if (message.action === ETSY_CONTENT_BRIDGE_ACTIONS.ordersList) {
      const payload = message.payload as EtsyContentOrdersListPayload;
      const result = await fetchOrderList(
        payload.shopId,
        payload.requestedCount,
        payload.baseParams,
        {
          credentials: payload.credentials ?? "include",
        }
      );
      return {
        success: true,
        data: result,
      };
    }

    if (message.action === ETSY_CONTENT_BRIDGE_ACTIONS.conversationImagesCollect) {
      return {
        success: true,
        data: collectConversationImagesFromPage(),
      };
    }

    if (message.action === ETSY_CONTENT_BRIDGE_ACTIONS.imagesZipDownload) {
      const payload = message.payload as EtsyImagesZipDownloadPayload;
      const data = await buildImagesZipData(payload.urls, payload.orderNumber);
      return {
        success: true,
        data,
      };
    }

    return {
      success: false,
      error: {
        code: "ETSY_CONTENT_ACTION_UNKNOWN",
        message: `未知 Etsy content action: ${message.action}`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: "ETSY_CONTENT_REQUEST_FAILED",
        message: error instanceof Error ? error.message : "Etsy 请求失败",
      },
    };
  }
}

export default defineContentScript({
  matches: ["*://*.etsy.com/*"],
  runAt: "document_start",
  registration: "manifest",
  async main() {
    // 初始化脚本注入（在启动时立即注入 page-inject.js）
    await initializeScriptInjection();
    console.log("✅ [隔离世界] content main 已启动，准备处理 Etsy move-orders 拦截与自动同步到 KST 逻辑");

    // 缓存从主世界获取的 Etsy 数据（shopId 与 orderStates）
    let cachedShopId: number | undefined;
    let cachedOrderStates: OrderState[] | undefined;
    let etsyDataPromise: Promise<{
      success: boolean;
      shopId?: number;
      orderStates?: OrderState[];
      error?: string;
    }> | null = null;

    const ensureEtsyData = async () => {
      console.log("🔍 [隔离世界] ensureEtsyData 调用开始，检查缓存");
      if (cachedShopId != null && cachedOrderStates != null) {
        console.log("✅ [隔离世界] 使用缓存的 Etsy 数据", {
          shopId: cachedShopId,
          orderStatesCount: cachedOrderStates.length,
        });
        return { shopId: cachedShopId, orderStates: cachedOrderStates };
      }
      if (!etsyDataPromise) {
        console.log("📤 [隔离世界] 无缓存，将通过 getEtsyDataFromMainWorld 请求主世界数据");
        etsyDataPromise = getEtsyDataFromMainWorld().finally(() => {
          etsyDataPromise = null;
        });
      }
      const result = await etsyDataPromise;
      if (result.success) {
        cachedShopId = result.shopId;
        cachedOrderStates = result.orderStates ?? [];
        console.log("✅ [隔离世界] ensureEtsyData 获取主世界数据成功", {
          shopId: cachedShopId,
          orderStatesCount: cachedOrderStates.length,
        });
      } else {
        console.warn("⚠️ [隔离世界] ensureEtsyData 获取主世界数据失败", {
          error: result.error,
        });
      }
      return { shopId: cachedShopId, orderStates: cachedOrderStates };
    };

    // 记录已捕获到的 move-orders 请求，待 Etsy 响应成功后再同步到 KST。
    // 注意：当前业务规则不是“仅待处理/New 才同步”，而是“任意 move-orders 状态切换都触发自动同步”。
    // 重复同步由本地缓存 kstSyncedOrderIds + KST 远端查重共同拦截，因此这里不要再按状态名收窄触发条件。
    // 如果未来要改这条规则，必须先和业务方确认，而不是按变量名或历史注释直接修改。
    const pendingMoveToNewByRequestId = new Map<
      string,
      {
        shopId?: number;
        targetStateId?: number;
        targetStateName?: string;
        orderIds: (string | number)[];
      }
    >();
    const pendingUpdateShipByDateByRequestId = new Map<
      string,
      {
        shopId?: string;
        orderId?: string;
        newShipByDate?: number | null;
        requestBody?: string | null;
      }
    >();

    /**
     * 当捕获到 move-orders 且 Etsy 响应成功时，直接同步到 KST 订单系统
     * （不导出 Excel，与弹窗「同步到 KST」流程一致）。
     *
     * 重要：无论订单被移动到哪个状态，只要是 move-orders，就会进入这条自动同步链路。
     * 不要把这里改回“只在 New/待处理 时同步”，否则会导致切换到处理中等状态时不再自动同步。
     */
    const syncOrdersForMoveToPending = async (params: {
      shopId?: number;
      targetStateId?: number;
      targetStateName?: string;
      orderIds: (string | number)[];
      requestId?: string;
    }) => {
      const { shopId, targetStateId, orderIds: rawOrderIds, requestId } = params;
      let orderIds = Array.from(
        new Set(
          rawOrderIds
            .map((id) => String(id ?? "").trim())
            .filter((id) => id.length > 0)
        )
      );
      console.log("[待处理监听] 入口", {
        requestId,
        shopId,
        targetStateId,
        orderIdsCount: orderIds.length,
      });

      if (shopId == null) {
        console.warn("[待处理监听] 同步中止：shopId 为空", { requestId });
        const idPreview = formatOrderIdsPreview(orderIds);
        getNotyf().error(
          idPreview
            ? `无法获取店铺信息，自动同步已取消（订单号：${idPreview}）`
            : "无法获取店铺信息，自动同步已取消"
        );
        return;
      }
      if (!orderIds.length) {
        console.warn("[待处理监听] 同步中止：orderIds 为空", { requestId });
        getNotyf().error("没有待同步的订单");
        return;
      }

      try {
        const exportIdPairs = orderIds
          .map((orderId) => ({
            rawOrderId: orderId,
            exportOrderId: getExportOrderId({ shopId, orderId }),
          }))
          .filter((pair) => pair.exportOrderId);

        let syncStatus: ResolvedOrderSyncStatus;
        try {
          syncStatus = await resolveOrderSyncStatus(
            exportIdPairs.map((pair) => pair.exportOrderId)
          );
        } catch (error) {
          console.error("[auto-sync] failed to resolve sync status before Etsy fetch", {
            requestId,
            shopId,
            exportOrderIdsPreview: exportIdPairs
              .map((pair) => pair.exportOrderId)
              .slice(0, 10),
            error,
            errorMessage: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
        if (syncStatus.localDuplicateOrderIds.length > 0) {
          console.log("[auto-sync] skipped locally cached order IDs before Etsy fetch", {
            requestId,
            skippedIds: syncStatus.localDuplicateOrderIds,
          });
          emitLogsForOrderIds(
            syncStatus.localDuplicateOrderIds,
            "auto_sync_skipped_local_duplicate",
            {
              requestId,
              shopId,
              targetStateId,
              targetStateName: params.targetStateName ?? "",
            }
          );
        }
        if (syncStatus.remoteDuplicateOrderIds.length > 0) {
          console.log("[auto-sync] skipped remotely duplicated order IDs before Etsy fetch", {
            requestId,
            skippedIds: syncStatus.remoteDuplicateOrderIds,
          });
          emitLogsForOrderIds(
            syncStatus.remoteDuplicateOrderIds,
            "auto_sync_skipped_remote_duplicate",
            {
              requestId,
              shopId,
              targetStateId,
              targetStateName: params.targetStateName ?? "",
            }
          );
        }

        if (!syncStatus.orderIdsToSync.length) {
          // If every moved order is already known as synced, skip the pipeline without a toast.
          emitLogsForOrderIds(
            exportIdPairs.map((pair) => pair.exportOrderId),
            "auto_sync_skipped_all_duplicates",
            {
              requestId,
              shopId,
              targetStateId,
              targetStateName: params.targetStateName ?? "",
            }
          );
          return;
        }

        const orderIdsToSyncSet = new Set(syncStatus.orderIdsToSync);
        orderIds = exportIdPairs
          .filter((pair) => orderIdsToSyncSet.has(pair.exportOrderId))
          .map((pair) => pair.rawOrderId);
        const stateIdStr =
          targetStateId != null ? String(targetStateId) : undefined;
        if (!stateIdStr) {
          console.warn("[待处理监听] 同步中止：targetStateId 为空", {
            requestId,
          });
          return;
        }

        const baseParams = getOrderListBaseParams(stateIdStr);
        const requestedCount = Math.max(orderIds.length, 100);
        console.log("[待处理监听] 同步 步骤 1/4：请求待处理订单列表", {
          requestId,
          shopId,
          requestedCount,
          filtersOrderStateId: baseParams["filters[order_state_id]"],
        });

        const { orders, buyers } = await fetchOrderList(
          shopId,
          requestedCount,
          baseParams,
          { credentials: "include" }
        );

        console.log("[待处理监听] fetchOrderList 返回", {
          requestId,
          totalOrders: orders.length,
          buyersCount: buyers.length,
        });

        const targetIdSet = new Set(orderIds.map((v) => String(v)));
        const filteredOrders = orders.filter((o) =>
          targetIdSet.has(String(o.order_id))
        );
        const foundIds = filteredOrders.map((o) => String(o.order_id));
        const foundIdSet = new Set(foundIds);
        const missingIds = orderIds.filter((id) => !foundIdSet.has(String(id)));
        if (missingIds.length > 0) {
          console.warn("[待处理监听] 部分订单在列表中未找到（可能延迟或分页未覆盖）", {
            requestId,
            missingCount: missingIds.length,
            missingIdsPreview: missingIds.slice(0, 10),
          });
          emitLogsForOrderIds(
            missingIds,
            "auto_sync_missing_from_etsy_list",
            {
              requestId,
              shopId,
              targetStateId,
              targetStateName: params.targetStateName ?? "",
            }
          );
        }

        console.log("[待处理监听] 同步 步骤 2/4：过滤结果", {
          requestId,
          expectedCount: orderIds.length,
          filteredCount: filteredOrders.length,
          foundIdsPreview: foundIds.slice(0, 5),
        });

        if (!filteredOrders.length) {
          console.warn("[待处理监听] 同步中止：无匹配订单", {
            requestId,
            orderIdsPreview: orderIds.slice(0, 10),
          });
          const idPreview = formatOrderIdsPreview(orderIds);
          getNotyf().error(
            idPreview
              ? `未找到匹配的订单（${idPreview}），请稍后重试`
              : "未找到匹配的订单，请稍后重试"
          );
          return;
        }

        console.log("[待处理监听] 同步 步骤 3/4：映射为表格行 mapOrdersToTableRows");
        const rows: ExportTableRow[] = mapOrdersToTableRows(
          filteredOrders as EtsyOrder[],
          buyers as EtsyBuyer[],
          { shopId }
        );
        console.log("[待处理监听] mapOrdersToTableRows 完成", {
          requestId,
          rowCount: rows.length,
        });

        console.log("[待处理监听] 同步 步骤 4/4：同步到 KST 订单系统");
        try {
          await syncOrdersToKst({
            shopId,
            rows,
            logContext: {
              source: "auto_move_orders",
              requestId,
              targetStateId,
              targetStateName: params.targetStateName,
              pageUrl: location.href,
            },
          });
          console.log("[待处理监听] KST 同步完成", {
            requestId,
            rowCount: rows.length,
          });
        } catch (syncError) {
          const msg =
            syncError instanceof Error ? syncError.message : "同步到 KST 失败，请重试";
          console.error("[待处理监听] KST 同步失败", {
            requestId,
            error: syncError,
            errorMessage: msg,
          });
          emitLogsForOrderIds(
            orderIds,
            "auto_sync_pipeline_failed",
            {
              requestId,
              shopId,
              targetStateId,
              targetStateName: params.targetStateName ?? "",
              error:
                syncError instanceof Error
                  ? { message: syncError.message, stack: syncError.stack ?? "" }
                  : String(syncError),
            }
          );
          const idPreview = formatOrderIdsPreview(orderIds);
          getNotyf().error(
            idPreview ? `${msg}（订单号：${idPreview}）` : msg
          );
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : "自动同步失败，请重试";
        console.error("[待处理监听] 异常", {
          requestId,
          error,
          errorMessage: msg,
        });
        emitLogsForOrderIds(
          orderIds,
          "auto_sync_pipeline_exception",
          {
            requestId,
            shopId,
            targetStateId,
            targetStateName: params.targetStateName ?? "",
            error:
              error instanceof Error
                ? { message: error.message, stack: error.stack ?? "" }
                : String(error),
          }
        );
        const idPreview = formatOrderIdsPreview(orderIds);
        getNotyf().error(
          idPreview ? `${msg}（订单号：${idPreview}）` : msg
        );
      }
    };

    // 监听主世界发来的 Etsy move-orders 拦截数据（待处理监听流程，便于排查可搜 [待处理监听]）
    window.addEventListener("message", (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as
        | {
            type: string;
            source?: string;
            requestId?: string;
            url?: string;
            method?: string;
            body?: string | null;
            status?: number;
            ok?: boolean;
            event?: string;
            payload?: {
              requestId?: string;
              url?: string;
              method?: string;
              body?: string | null;
              status?: number;
              ok?: boolean;
              shopId?: string;
              orderId?: string;
              newShipByDate?: number | null;
            };
            meta?: {
              source?: string;
            };
            shopId?: string;
            orderId?: string;
            newShipByDate?: number | null;
          }
        | undefined;

      const normalizedType =
        data?.type === "etsy-move-orders-request"
          ? "moveOrders.requested"
          : data?.type === "etsy-move-orders-response"
            ? "moveOrders.responded"
            : data?.type === "etsy-update-ship-by-date-request"
              ? "updateShipByDate.requested"
              : data?.type === "etsy-update-ship-by-date-response"
                ? "updateShipByDate.responded"
                : data?.type === ETSY_BRIDGE_EVENT_TYPE
                  ? data.event
                  : undefined;

      const normalizedPayload =
        data?.type === ETSY_BRIDGE_EVENT_TYPE ? data.payload : data;
      const normalizedSource =
        data?.type === ETSY_BRIDGE_EVENT_TYPE ? data.meta?.source : data?.source;

      const normalizedMoveOrdersMessage =
        normalizedType === "moveOrders.requested" ||
        normalizedType === "moveOrders.responded"
          ? {
              type: normalizedType,
              source: normalizedSource,
              requestId: normalizedPayload?.requestId,
              url: normalizedPayload?.url,
              method: normalizedPayload?.method,
              body: normalizedPayload?.body,
              status: normalizedPayload?.status,
              ok: normalizedPayload?.ok,
            }
          : null;
      const normalizedUpdateShipByDateMessage =
        normalizedType === "updateShipByDate.requested" ||
        normalizedType === "updateShipByDate.responded"
          ? {
              type: normalizedType,
              source: normalizedSource,
              requestId: normalizedPayload?.requestId,
              url: normalizedPayload?.url,
              method: normalizedPayload?.method,
              body: normalizedPayload?.body,
              status: normalizedPayload?.status,
              ok: normalizedPayload?.ok,
              shopId: normalizedPayload?.shopId,
              orderId: normalizedPayload?.orderId,
              newShipByDate: normalizedPayload?.newShipByDate,
            }
          : null;

      if (normalizedMoveOrdersMessage) {
        console.log("[待处理监听] 收到 move-orders 相关消息", {
          type: normalizedMoveOrdersMessage.type,
          requestId: normalizedMoveOrdersMessage.requestId,
          source: normalizedMoveOrdersMessage.source,
        });
      }

      if (normalizedUpdateShipByDateMessage) {
        console.log("[发货日期监听] 收到 update-ship-by-date 相关消息", {
          type: normalizedUpdateShipByDateMessage.type,
          requestId: normalizedUpdateShipByDateMessage.requestId,
          orderId: normalizedUpdateShipByDateMessage.orderId,
          newShipByDate: normalizedUpdateShipByDateMessage.newShipByDate,
          source: normalizedUpdateShipByDateMessage.source,
        });
      }

      if (normalizedUpdateShipByDateMessage) {
        if (
          normalizedUpdateShipByDateMessage.source !== "page-inject" &&
          normalizedUpdateShipByDateMessage.source !== "page"
        ) {
          return;
        }

        if (normalizedUpdateShipByDateMessage.type === "updateShipByDate.requested") {
          const requestId = normalizedUpdateShipByDateMessage.requestId;
          if (!requestId) {
            console.warn("[发货日期监听] 请求缺少 requestId，无法等待成功响应");
            return;
          }
          pendingUpdateShipByDateByRequestId.set(requestId, {
            shopId: normalizedUpdateShipByDateMessage.shopId,
            orderId: normalizedUpdateShipByDateMessage.orderId,
            newShipByDate: normalizedUpdateShipByDateMessage.newShipByDate,
            requestBody: normalizedUpdateShipByDateMessage.body,
          });
          console.log("[发货日期监听] 已缓存请求，等待 Etsy 成功响应", {
            requestId,
            shopId: normalizedUpdateShipByDateMessage.shopId,
            orderId: normalizedUpdateShipByDateMessage.orderId,
            newShipByDate: normalizedUpdateShipByDateMessage.newShipByDate,
            cacheSize: pendingUpdateShipByDateByRequestId.size,
          });
          return;
        }

        if (normalizedUpdateShipByDateMessage.type === "updateShipByDate.responded") {
          void (async () => {
            const requestId = normalizedUpdateShipByDateMessage.requestId;
            if (!requestId) {
              console.warn("[发货日期监听] 响应缺少 requestId，无法匹配请求缓存");
              return;
            }

            const pending = pendingUpdateShipByDateByRequestId.get(requestId);
            if (!pending) {
              console.log("[发货日期监听] 未找到对应请求缓存", {
                requestId,
                status: normalizedUpdateShipByDateMessage.status,
                ok: normalizedUpdateShipByDateMessage.ok,
              });
              return;
            }

            const isSuccess =
              normalizedUpdateShipByDateMessage.ok === true &&
              typeof normalizedUpdateShipByDateMessage.status === "number" &&
              normalizedUpdateShipByDateMessage.status >= 200 &&
              normalizedUpdateShipByDateMessage.status < 300;

            if (!isSuccess) {
              console.warn("[发货日期监听] Etsy 修改发货日期失败，暂不回传系统", {
                requestId,
                orderId: pending.orderId,
                newShipByDate: pending.newShipByDate,
                status: normalizedUpdateShipByDateMessage.status,
                ok: normalizedUpdateShipByDateMessage.ok,
              });
              pendingUpdateShipByDateByRequestId.delete(requestId);
              return;
            }

            console.log("[发货日期监听] Etsy 修改发货日期成功，开始同步 KST 最晚发货时间", {
              requestId,
              shopId: pending.shopId,
              orderId: pending.orderId,
              newShipByDate: pending.newShipByDate,
            });
            void emitAppLog({
              event: "ship_by_date_change_succeeded",
              orderNo: pending.orderId ?? "__SYSTEM__",
              source: "auto_update_ship_by_date",
              occurredAt: new Date().toISOString(),
              data: {
                requestId,
                shopId: pending.shopId,
                orderId: pending.orderId,
                newShipByDate: pending.newShipByDate,
                requestBody: pending.requestBody ?? "",
                requestUrl: normalizedUpdateShipByDateMessage.url ?? "",
                requestMethod: normalizedUpdateShipByDateMessage.method ?? "",
                status: normalizedUpdateShipByDateMessage.status,
                ok: normalizedUpdateShipByDateMessage.ok,
                pageUrl: location.href,
              },
            });
            if (!pending.orderId || typeof pending.newShipByDate !== "number") {
              console.log("[发货日期监听] 缺少订单号或 newShipByDate，跳过 KST 更新", {
                requestId,
                orderId: pending.orderId,
                newShipByDate: pending.newShipByDate,
              });
              pendingUpdateShipByDateByRequestId.delete(requestId);
              return;
            }

            try {
              const latestDeliveryTime = formatChinaDateTimeFromUnixSeconds(
                pending.newShipByDate
              );
              const listResponse = await fetchPlatformOrdersListViaProxy({
                pageNum: 1,
                pageSize: 1,
                platformOrderIds: pending.orderId,
              });
              const matchedRows = Array.isArray(listResponse.rows)
                ? listResponse.rows
                : [];

              if (matchedRows.length !== 1) {
                console.log("[发货日期监听] KST 列表匹配数量不是 1，静默跳过", {
                  requestId,
                  platformOrderIds: pending.orderId,
                  matchedCount: matchedRows.length,
                  total: listResponse.total,
                });
                pendingUpdateShipByDateByRequestId.delete(requestId);
                return;
              }

              const systemOrderId = matchedRows[0]?.id;
              if (!systemOrderId) {
                console.log("[发货日期监听] KST 列表返回缺少系统订单 id，静默跳过", {
                  requestId,
                  platformOrderIds: pending.orderId,
                });
                pendingUpdateShipByDateByRequestId.delete(requestId);
                return;
              }

              const detailResponse = await fetchPlatformOrderDetailViaProxy(systemOrderId);
              const errorInfo = appendShipByDateLog({
                errorInfo: detailResponse.data?.errorInfo ?? null,
                platformOrderId: pending.orderId,
                latestDeliveryTime,
              });

              await updatePlatformOrderShipByDateViaProxy({
                id: systemOrderId,
                latestDeliveryTime,
                errorInfo,
              });

              console.log("[发货日期监听] 已同步 KST 最晚发货时间和日志", {
                requestId,
                systemOrderId,
                platformOrderId: pending.orderId,
                latestDeliveryTime,
              });
            } catch (error) {
              console.warn("[发货日期监听] 同步 KST 最晚发货时间失败，已跳过", {
                requestId,
                orderId: pending.orderId,
                newShipByDate: pending.newShipByDate,
                error,
                errorMessage: error instanceof Error ? error.message : String(error),
              });
            }
            pendingUpdateShipByDateByRequestId.delete(requestId);
          })();
          return;
        }

        return;
      }

      if (!normalizedMoveOrdersMessage) return;
      if (
        normalizedMoveOrdersMessage.source !== "page-inject" &&
        normalizedMoveOrdersMessage.source !== "page"
      ) {
        return;
      }

      if (normalizedMoveOrdersMessage.type === "moveOrders.requested") {
        void (async () => {
          console.log("[待处理监听] 步骤 1/5：开始处理 move-orders 请求");
          try {
            console.log("[待处理监听] 步骤 2/5：获取 Etsy 数据（shopId、orderStates）");
            const { shopId, orderStates } = await ensureEtsyData();
            console.log("[待处理监听] ensureEtsyData 结果", {
              requestId: normalizedMoveOrdersMessage.requestId,
              shopId,
              shopIdOk: shopId != null,
              orderStatesCount: orderStates?.length ?? 0,
              orderStatesSummary:
                orderStates?.map((s) => ({ id: s.order_state_id, name: s.name })) ?? [],
            });

            let parsedBody: any = null;
            const bodyStr =
              typeof normalizedMoveOrdersMessage.body === "string"
                ? normalizedMoveOrdersMessage.body
                : "";
            if (bodyStr.trim()) {
              try {
                parsedBody = JSON.parse(bodyStr);
                console.log("[待处理监听] 请求 body 解析成功", {
                  requestId: normalizedMoveOrdersMessage.requestId,
                  hasOrderStateId: parsedBody?.order_state_id != null,
                  orderIdsLength: Array.isArray(parsedBody?.order_ids)
                    ? parsedBody.order_ids.length
                    : 0,
                });
              } catch {
                console.warn("[待处理监听] 请求 body JSON 解析失败", {
                  requestId: normalizedMoveOrdersMessage.requestId,
                  bodyLength: bodyStr.length,
                  bodyPreview: bodyStr.slice(0, 200),
                });
              }
            } else {
              console.warn("[待处理监听] 请求 body 为空", {
                requestId: normalizedMoveOrdersMessage.requestId,
              });
            }

            const orderStateId: number | undefined = parsedBody?.order_state_id;
            const orderIds: (string | number)[] = Array.isArray(parsedBody?.order_ids)
              ? parsedBody.order_ids
              : [];

            const stateName =
              orderStateId != null && Array.isArray(orderStates)
                ? orderStates.find((s) => s.order_state_id === orderStateId)?.name ?? ""
                : "";

            console.log("[待处理监听] 步骤 3/5：解析请求参数", {
              requestId: normalizedMoveOrdersMessage.requestId,
              orderStateId,
              stateName,
              orderIdsCount: orderIds.length,
              orderIdsPreview: orderIds.slice(0, 5),
            });
            emitLogsForOrderIds(
              orderIds,
              "order_state_change_requested",
              {
                requestId: normalizedMoveOrdersMessage.requestId,
                orderStateId,
                stateName,
                requestUrl: normalizedMoveOrdersMessage.url ?? "",
                requestMethod: normalizedMoveOrdersMessage.method ?? "",
                requestBody:
                  typeof normalizedMoveOrdersMessage.body === "string"
                    ? normalizedMoveOrdersMessage.body
                    : "",
                pageUrl: location.href,
              }
            );

            // 重要业务规则：
            // 1. 任意 move-orders 状态切换都触发自动同步，不按目标状态过滤。
            // 2. 重复由本地缓存 + KST 远端查重拦截，而不是靠状态判断避免。
            // 3. 这里曾被误改成只允许 New/待处理 触发，导致切换到处理中时 cacheSize=0、响应阶段直接结束。
            // 后续维护请保留该行为，除非业务规则明确变化。
            const normalizedName = (stateName ?? "").trim().toLowerCase();
            const shouldTriggerAutoSync = true;
            console.log("[待处理监听] 步骤 4/5：判断是否为目标状态「待处理」", {
              requestId: normalizedMoveOrdersMessage.requestId,
              stateName,
              normalizedName,
              shouldTriggerAutoSync,
              matchReason:
                shouldTriggerAutoSync
                  ? "当前配置：所有状态变更都触发自动同步"
                  : "不匹配",
            });

            if (shouldTriggerAutoSync) {
              if (normalizedMoveOrdersMessage.requestId) {
                pendingMoveToNewByRequestId.set(normalizedMoveOrdersMessage.requestId, {
                  shopId,
                  targetStateId: orderStateId,
                  targetStateName: stateName,
                  orderIds,
                });
                console.log("[待处理监听] 步骤 5/5：已写入缓存，等待响应", {
                  requestId: normalizedMoveOrdersMessage.requestId,
                  cachedShopId: shopId,
                  targetStateId: orderStateId,
                  orderIdsCount: orderIds.length,
                  cacheSize: pendingMoveToNewByRequestId.size,
                  cacheKeys: [...pendingMoveToNewByRequestId.keys()],
                });
              } else {
                console.warn("[待处理监听] 无法缓存：缺少 requestId", {
                  stateName,
                  orderIdsCount: orderIds.length,
                });
              }
            } else {
              console.log("[待处理监听] 非待处理状态，不缓存", {
                requestId: normalizedMoveOrdersMessage.requestId,
                stateName,
              });
            }
          } catch (err) {
            console.error("[待处理监听] 处理 move-orders 请求异常", {
              requestId: normalizedMoveOrdersMessage.requestId,
              error: err,
              errorMessage: err instanceof Error ? err.message : String(err),
            });
          }
        })();
      }

      if (normalizedMoveOrdersMessage.type === "moveOrders.responded") {
        void (async () => {
          const requestId = normalizedMoveOrdersMessage.requestId;
          console.log("[待处理监听] 响应 步骤 1/6：收到 move-orders 响应", {
            requestId,
            status: normalizedMoveOrdersMessage.status,
            ok: normalizedMoveOrdersMessage.ok,
            bodyLength:
              typeof normalizedMoveOrdersMessage.body === "string"
                ? normalizedMoveOrdersMessage.body.length
                : 0,
          });

          if (!requestId) {
            console.warn("[待处理监听] 响应 步骤 1 失败：缺少 requestId，无法匹配缓存");
            return;
          }

          console.log("[待处理监听] 响应 步骤 2/6：查找请求缓存", {
            requestId,
            cacheSize: pendingMoveToNewByRequestId.size,
            cacheKeys: [...pendingMoveToNewByRequestId.keys()],
          });
          const pending = pendingMoveToNewByRequestId.get(requestId);
          if (!pending) {
            console.log("[待处理监听] 未找到对应请求缓存（可能非待处理或 requestId 不一致）", {
              requestId,
            });
            void emitAppLog({
              event: "order_state_change_response_without_pending",
              orderNo: "__SYSTEM__",
              source: "auto_move_orders",
              occurredAt: new Date().toISOString(),
              data: {
                requestId,
                status: normalizedMoveOrdersMessage.status,
                ok: normalizedMoveOrdersMessage.ok,
                responseBody:
                  typeof normalizedMoveOrdersMessage.body === "string"
                    ? normalizedMoveOrdersMessage.body
                    : "",
                pageUrl: location.href,
              },
            });
            return;
          }
          console.log("[待处理监听] 已找到缓存", {
            requestId,
            shopId: pending.shopId,
            orderIdsCount: pending.orderIds.length,
          });

          const isSuccess =
            normalizedMoveOrdersMessage.ok === true &&
            typeof normalizedMoveOrdersMessage.status === "number" &&
            normalizedMoveOrdersMessage.status >= 200 &&
            normalizedMoveOrdersMessage.status < 300;
          console.log("[待处理监听] 响应 步骤 3/6：检查 HTTP 状态", {
            requestId,
            status: normalizedMoveOrdersMessage.status,
            ok: normalizedMoveOrdersMessage.ok,
            isSuccess,
            willTrigger: isSuccess,
          });

          if (!isSuccess) {
            console.warn("[待处理监听] 响应非 2xx，取消同步到 KST", {
              requestId,
              status: normalizedMoveOrdersMessage.status,
            });
            emitLogsForOrderIds(
              pending.orderIds,
              "order_state_change_failed",
              {
                requestId,
                status: normalizedMoveOrdersMessage.status,
                ok: normalizedMoveOrdersMessage.ok,
                responseBody:
                  typeof normalizedMoveOrdersMessage.body === "string"
                    ? normalizedMoveOrdersMessage.body
                    : "",
                targetStateId: pending.targetStateId,
                targetStateName: pending.targetStateName ?? "",
                pageUrl: location.href,
              }
            );
            const idPreview = formatOrderIdsPreview(pending.orderIds);
            getNotyf().error(
              idPreview
                ? `Etsy 操作失败，未同步到 KST（订单号：${idPreview}）`
                : "Etsy 操作失败，未同步到 KST"
            );
            pendingMoveToNewByRequestId.delete(requestId);
            console.log("[待处理监听] 已从缓存移除", {
              requestId,
              cacheSize: pendingMoveToNewByRequestId.size,
            });
            return;
          }

          console.log("[待处理监听] 响应 步骤 4/6：检查 KST 登录状态");
          const loggedIn = await isLoggedIn();
          if (!loggedIn) {
            const authDebugSnapshot = await getAuthDebugSnapshot();
            console.warn("[待处理监听] 未登录 KST，中断流程", {
              requestId,
              authDebugSnapshot,
              pendingOrderIdsPreview: pending.orderIds.slice(0, 10),
              pendingOrderIdsCount: pending.orderIds.length,
              currentUrl: location.href,
              runtimeId: browser.runtime.id,
            });
            emitLogsForOrderIds(
              pending.orderIds,
              "auto_sync_skipped_not_logged_in",
              {
                requestId,
                targetStateId: pending.targetStateId,
                targetStateName: pending.targetStateName ?? "",
                authDebugSnapshot,
                pageUrl: location.href,
              }
            );
            const idPreview = formatOrderIdsPreview(pending.orderIds);
            getNotyf().error(
              idPreview
                ? `请先登录 KST 账号，订单将不会自动同步（订单号：${idPreview}）`
                : "请先登录 KST 账号，订单将不会自动同步"
            );
            pendingMoveToNewByRequestId.delete(requestId);
            return;
          }
          console.log("[待处理监听] 已登录 KST，继续");
          emitLogsForOrderIds(
            pending.orderIds,
            "order_state_change_succeeded",
            {
              requestId,
              status: normalizedMoveOrdersMessage.status,
              ok: normalizedMoveOrdersMessage.ok,
              responseBody:
                typeof normalizedMoveOrdersMessage.body === "string"
                  ? normalizedMoveOrdersMessage.body
                  : "",
              targetStateId: pending.targetStateId,
              targetStateName: pending.targetStateName ?? "",
              pageUrl: location.href,
            }
          );

          pendingMoveToNewByRequestId.delete(requestId);
          console.log("[待处理监听] 响应 步骤 5/6：清理缓存并触发同步到 KST", {
            requestId,
            cacheSizeAfter: pendingMoveToNewByRequestId.size,
            params: {
              shopId: pending.shopId,
              targetStateId: pending.targetStateId,
              orderIdsCount: pending.orderIds.length,
            },
          });

          console.log("[待处理监听] 响应 步骤 6/6：调用");
          await syncOrdersForMoveToPending({
            shopId: pending.shopId,
            targetStateId: pending.targetStateId,
            targetStateName: pending.targetStateName,
            orderIds: pending.orderIds,
            requestId,
          });
        })();
      }
    });

    // 监听来自 popup / 扩展页的统一 Etsy content bridge 请求
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log(
        "🚀 ~ browser.runtime.onMessage.addListener ~ message:",
        message
      );

      if ((message as { type?: string })?.type === ETSY_CONTENT_BRIDGE_MESSAGE_TYPE) {
        void handleEtsyContentBridgeRequest(
          message as EtsyContentBridgeRequest
        ).then(sendResponse);
        return true;
      }

      return false;
    });

    // 等待 DOM 完全加载
    const init = () => {
      if (document.body) {
        // 检查是否已经存在容器，避免重复注入
        let container = document.getElementById("wxt-file-upload-widget");
        if (!container) {
          container = document.createElement("div");
          container.id = "wxt-file-upload-widget";
          document.body.appendChild(container);
        }

        // 挂载包装组件（由包装组件内部判断是否显示 FileUploadWidget）
        try {
          const app = createApp(ContentScriptWrapper);
          app.mount(container);
        } catch (error) {
          console.error("ContentScript 包装组件挂载失败:", error);
        }
      } else {
        setTimeout(init, 100);
      }
    };

    // 如果 DOM 已经准备好，立即执行
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  },
});
