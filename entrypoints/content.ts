import { createApp } from "vue";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import ContentScriptWrapper from "@/components/ContentScriptWrapper.vue";
import { fetchOrderList } from "@/composables/useFetchOrderList";
import {
  EXPORT_COLUMNS,
  mapOrdersToTableRows,
  type ExportTableRow,
} from "@/utils/orders-mapping";

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

// 订单状态类型定义
type OrderState = {
  type: string;
  order_state_id: number;
  client_id: number | null;
  position: number;
  name: string;
  state_type: string;
  order_count: number | null;
  actions: string[];
};

/**
 * 通过 postMessage 与主世界脚本通信，获取 Etsy 数据（shopId 和 orderStates）
 * @returns Promise<{success: boolean, shopId?: number, orderStates?: OrderState[], error?: string}>
 */
function getEtsyDataFromMainWorld(): Promise<{
  success: boolean;
  shopId?: number;
  orderStates?: OrderState[];
  error?: string;
}> {
  return new Promise(async (resolve, reject) => {
    try {
      // 确保注入脚本已加载（使用状态管理，避免重复注入）
      await injectScript("page-inject.js");

      // 生成唯一的请求 ID
      const requestId = `etsy-data-${Date.now()}-${Math.random()}`;

      // 设置超时，避免无限等待
      const timeout = setTimeout(() => {
        window.removeEventListener("message", handleResponse);
        reject(new Error("获取 Etsy 数据超时，主世界脚本可能未响应"));
      }, 5000); // 5秒超时

      // 处理响应
      function handleResponse(event: MessageEvent) {
        // 确保消息来自当前窗口
        if (event.source !== window) return;

        // 检查消息类型和请求 ID
        if (
          event.data &&
          event.data.type === "etsy-data-response" &&
          event.data.requestId === requestId
        ) {
          clearTimeout(timeout);
          window.removeEventListener("message", handleResponse);

          const { success, shopId, orderStates, error } = event.data;

          if (success && shopId !== undefined) {
            console.log("✅ [隔离世界] 成功从主世界获取 Etsy 数据");
            console.log("📋 [隔离世界] shopId:", shopId);
            console.log("📋 [隔离世界] orderStates 数量:", orderStates?.length || 0);
            resolve({ success: true, shopId, orderStates });
          } else {
            console.warn("⚠️ [隔离世界] 从主世界获取 Etsy 数据失败:", error);
            resolve({
              success: false,
              error: error || "无法获取 Etsy 数据",
            });
          }
        }
      }

      // 监听响应消息
      window.addEventListener("message", handleResponse);

      // 发送请求到主世界
      window.postMessage(
        {
          type: "get-etsy-data",
          requestId: requestId,
        },
        "*"
      );
      console.log("📤 [隔离世界] 已发送获取 Etsy 数据请求到主世界");
    } catch (error) {
      console.error("❌ [隔离世界] 获取 Etsy 数据时发生错误:", error);
      reject(error);
    }
  });
}

export default defineContentScript({
  matches: ["*://*.etsy.com/*"],
  runAt: "document_start",
  registration: "manifest",
  async main() {
    // 初始化脚本注入（在启动时立即注入 page-inject.js）
    await initializeScriptInjection();
    console.log("✅ [隔离世界] content main 已启动，准备处理 Etsy move-orders 拦截与自动导出逻辑");

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

    // 记录「准备将订单移动到 New/待处理」的请求信息，待响应成功后再真正导出
    const pendingMoveToNewByRequestId = new Map<
      string,
      {
        shopId?: number;
        targetStateId?: number;
        targetStateName?: string;
        orderIds: (string | number)[];
      }
    >();

    /**
     * 当捕获到将订单状态修改为“New/待处理”时，自动导出本次涉及的订单
     */
    const exportOrdersForMoveToNew = async (params: {
      shopId?: number;
      targetStateId?: number;
      targetStateName?: string;
      orderIds: (string | number)[];
      requestId?: string;
    }) => {
      const { shopId, targetStateId, targetStateName, orderIds, requestId } = params;
      console.log("📦 [隔离世界] 准备为 move-orders 导出订单（入口）", {
        requestId,
        shopId,
        targetStateId,
        targetStateName,
        orderIdsCount: orderIds.length,
      });

      if (shopId == null) {
        console.warn("⚠️ [隔离世界] 导出中止：shopId 为空", { requestId });
        return;
      }
      if (!orderIds.length) {
        console.warn("⚠️ [隔离世界] 导出中止：orderIds 为空", { requestId });
        return;
      }

      try {
        // 目标状态 ID 作为 filters[order_state_id]
        const stateIdStr =
          targetStateId != null ? String(targetStateId) : undefined;
        if (!stateIdStr) {
          console.warn("⚠️ [隔离世界] 导出中止：targetStateId 为空", {
            requestId,
            targetStateName,
          });
          return;
        }

        // 这里借用订单导出 modal 的默认筛选参数，只调整 order_state_id
        const baseParams: Record<string, string> = {
          "filters[buyer_id]": "all",
          "filters[channel]": "all",
          "filters[completed_status]": "all",
          "filters[completed_date]": "all",
          "filters[destination]": "all",
          "filters[ship_date]": "all",
          "filters[shipping_label_eligibility]": "false",
          "filters[shipping_label_status]": "all",
          "filters[has_buyer_notes]": "false",
          "filters[is_marked_as_gift]": "false",
          "filters[is_personalized]": "false",
          "filters[has_shipping_upgrade]": "false",
          "filters[order_state_id]": stateIdStr,
          search_terms: "",
          sort_by: "order_date",
          sort_order: "desc",
          "objects_enabled_for_normalization[order_state]": "true",
        };

        // 请求数量：至少等于本次涉及的订单数，适当放大一点以提高命中率
        const requestedCount = Math.max(orderIds.length, 100);
        console.log("📡 [隔离世界] 调用 fetchOrderList 获取订单列表", {
          requestId,
          shopId,
          requestedCount,
          baseParams,
        });

        const { orders, buyers } = await fetchOrderList(
          shopId,
          requestedCount,
          baseParams,
          { credentials: "include" }
        );

        console.log("📥 [隔离世界] fetchOrderList 返回结果", {
          requestId,
          totalOrders: orders.length,
          buyersCount: buyers.length,
        });

        // 按本次 move-orders 涉及的 orderIds 过滤出目标订单
        const targetIdSet = new Set(orderIds.map((v) => String(v)));
        const filteredOrders = orders.filter((o) =>
          targetIdSet.has(String((o as any).order_id))
        );

        console.log("🔎 [隔离世界] 根据 orderIds 过滤后的订单", {
          requestId,
          targetCount: filteredOrders.length,
          expectedCount: orderIds.length,
        });

        if (!filteredOrders.length) {
          console.warn("⚠️ [隔离世界] 导出中止：未在订单列表中找到任何匹配的订单", {
            requestId,
            orderIds,
          });
          return;
        }

        // 映射为导出表格行（复用现有订单导出逻辑）
        console.log("🧮 [隔离世界] 开始 mapOrdersToTableRows", {
          requestId,
          filteredOrdersCount: filteredOrders.length,
        });
        const rows: ExportTableRow[] = mapOrdersToTableRows(
          filteredOrders as any,
          buyers as any,
          {}
        );

        console.log("✅ [隔离世界] mapOrdersToTableRows 完成", {
          requestId,
          rowCount: rows.length,
        });

        // 使用 XLSX 导出为 Excel 文件
        const ws = XLSX.utils.json_to_sheet(rows, {
          header: [...EXPORT_COLUMNS],
        });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Orders");

        const now = new Date();
        const datePart = now.toISOString().slice(0, 10);
        const timePart = `${now
          .getHours()
          .toString()
          .padStart(2, "0")}${now.getMinutes().toString().padStart(2, "0")}`;
        const safeStateName =
          (targetStateName || "unknown").replace(/[/\\?*:|"<>\s]/g, "_");
        const filename = `orders-move-to-${safeStateName}-${datePart}-${timePart}.xlsx`;

        console.log("📤 [隔离世界] 正在写出 Excel 文件", {
          requestId,
          filename,
        });
        XLSX.writeFile(wb, filename);
        console.log("🎉 [隔离世界] 自动导出完成（move-orders）", {
          requestId,
          filename,
          exportedCount: rows.length,
        });
      } catch (error) {
        console.error("❌ [隔离世界] 自动导出 move-orders 订单失败", {
          requestId,
          error,
        });
      }
    };

    // 监听主世界发来的 Etsy move-orders 拦截数据
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
          }
        | undefined;
      if (!data || data.source !== "page-inject") return;

      if (data.type === "etsy-move-orders-request") {
        void (async () => {
          try {
            const { shopId, orderStates } = await ensureEtsyData();
            console.log("🔔 [隔离世界] 收到 etsy-move-orders-request 事件", {
              requestId: data.requestId,
              url: data.url,
              method: data.method,
              hasShopId: shopId != null,
              orderStatesCount: orderStates?.length ?? 0,
            });

            let parsedBody: any = null;
            if (typeof data.body === "string" && data.body.trim()) {
              try {
                parsedBody = JSON.parse(data.body);
              } catch {
                // 忽略 body 解析错误
                console.warn("⚠️ [隔离世界] move-orders body JSON 解析失败，将使用原始字符串", {
                  requestId: data.requestId,
                  rawBody: data.body,
                });
              }
            }

            const orderStateId: number | undefined = parsedBody?.order_state_id;
            const orderIds: (string | number)[] = Array.isArray(parsedBody?.order_ids)
              ? parsedBody.order_ids
              : [];

            const stateName =
              orderStateId != null && Array.isArray(orderStates)
                ? orderStates.find((s) => s.order_state_id === orderStateId)?.name ?? ""
                : "";

            console.log("📥 [隔离世界] 捕获 Etsy move-orders 请求:", {
              requestId: data.requestId,
              shopId,
              url: data.url,
              method: data.method,
              orderStateId,
              orderStateName: stateName, // 这里就是 Etsy 返回的英文名，如 "New" / "In production"
              orderIds,
              rawBody: data.body,
            });

            // 当目标状态为 "New"（待处理）时，记录下来，待响应成功后再触发自动导出
            const isMoveToNew =
              !!stateName && stateName.toLowerCase() === "new";
            console.log("🧷 [隔离世界] move-orders 状态检查", {
              requestId: data.requestId,
              stateName,
              isMoveToNew,
            });

            if (isMoveToNew) {
              if (data.requestId) {
                pendingMoveToNewByRequestId.set(data.requestId, {
                  shopId,
                  targetStateId: orderStateId,
                  targetStateName: stateName,
                  orderIds,
                });
                console.log("📌 [隔离世界] 已缓存待导出的 move-to-New 请求，等待响应成功后处理", {
                  requestId: data.requestId,
                  cachedShopId: shopId,
                  targetStateId: orderStateId,
                  orderIdsCount: orderIds.length,
                });
              } else {
                console.warn("⚠️ [隔离世界] move-to-New 请求缺少 requestId，无法在响应阶段匹配导出", {
                  stateName,
                  orderIds,
                });
              }
            } else {
              console.log("ℹ️ [隔离世界] 本次 move-orders 目标状态非 New，跳过自动导出", {
                requestId: data.requestId,
                stateName,
              });
            }
          } catch (err) {
            console.error("📥 [隔离世界] 解析 Etsy move-orders 请求失败:", {
              data,
              error: err,
            });
          }
        })();
      }

      if (data.type === "etsy-move-orders-response") {
        console.log("📤 [隔离世界] 捕获 Etsy move-orders 响应:", {
          requestId: data.requestId,
          url: data.url,
          status: data.status,
          ok: data.ok,
          body: data.body,
        });

        const requestId = data.requestId;
        if (!requestId) {
          console.warn("⚠️ [隔离世界] move-orders 响应缺少 requestId，无法匹配到请求缓存");
          return;
        }

        const pending = pendingMoveToNewByRequestId.get(requestId);
        if (!pending) {
          console.log("ℹ️ [隔离世界] move-orders 响应对应的请求未标记为 move-to-New，跳过自动导出", {
            requestId,
          });
          return;
        }

        // 只有当响应成功（状态码 2xx 且 ok=true）时才触发导出
        const isSuccess =
          data.ok === true &&
          typeof data.status === "number" &&
          data.status >= 200 &&
          data.status < 300;

        console.log("🧾 [隔离世界] move-orders 响应状态检查（用于决定是否导出）", {
          requestId,
          status: data.status,
          ok: data.ok,
          isSuccess,
        });

        if (!isSuccess) {
          console.warn("⚠️ [隔离世界] move-orders 响应非成功状态，自动导出取消", {
            requestId,
            status: data.status,
            ok: data.ok,
          });
          // 无论成功与否，都可以清理缓存，避免内存泄漏
          pendingMoveToNewByRequestId.delete(requestId);
          return;
        }

        // 成功响应：触发导出，然后清理缓存
        pendingMoveToNewByRequestId.delete(requestId);
        console.log("🚀 [隔离世界] move-orders 响应成功，开始执行自动导出（New/待处理）", {
          requestId,
          cachedParams: pending,
        });

        void exportOrdersForMoveToNew({
          shopId: pending.shopId,
          targetStateId: pending.targetStateId,
          targetStateName: pending.targetStateName,
          orderIds: pending.orderIds,
          requestId,
        });
      }
    });

    // 监听来自 popup 的消息，返回当前页面的 cookie 或 shopId
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log(
        "🚀 ~ browser.runtime.onMessage.addListener ~ message:",
        message
      );

      if (message.type === "GET_COOKIES") {
        try {
          // 从当前页面获取完整的 cookie
          const cookies = document.cookie;
          sendResponse({ success: true, cookies });
        } catch (error) {
          console.error("获取 cookie 失败:", error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : "未知错误",
          });
        }
        return true; // 保持消息通道开放，用于异步响应
      }

      if (message.type === "GET_SHOP_ID") {
        // 通过 postMessage 与主世界脚本通信获取 Etsy 数据
        getEtsyDataFromMainWorld()
          .then((result) => {
            sendResponse(result);
          })
          .catch((error) => {
            console.error("获取 Etsy 数据失败:", error);
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : "未知错误",
            });
          });
        return true; // 保持消息通道开放，用于异步响应
      }

      if (message.type === "GET_MSG_LIST_IMAGES") {
        try {
          const container =
            document.querySelector("#msg-list-container") ??
            document.querySelector(".msg-list-container");

          if (!container) {
            sendResponse({
              success: false,
              error: "未找到 msg-list-container，请确保在聊天页面打开",
            });
            return true;
          }

          const links = container.querySelectorAll("a");
          const urlSet = new Set<string>();
          links.forEach((a) => {
            const href = (a.getAttribute("href") ?? a.href)?.trim();
            if (href) urlSet.add(href);
          });
          const urls = Array.from(urlSet);

          sendResponse({ success: true, urls });
        } catch (error) {
          console.error("获取聊天图片链接失败:", error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : "未知错误",
          });
        }
        return true;
      }

      if (message.type === "GET_ORDER_NUMBER") {
        try {
          const buyerInfo = document.querySelector(".buyer-info");
          if (!buyerInfo) {
            sendResponse({
              success: true,
              orderNumber: "",
              error: "未找到 buyer-info 区域",
            });
            return true;
          }

          const listUnstyled = buyerInfo.querySelector(".wt-list-unstyled");
          if (!listUnstyled) {
            sendResponse({
              success: true,
              orderNumber: "",
              error: "未找到 wt-list-unstyled",
            });
            return true;
          }

          const truncateEl = listUnstyled.querySelector(".wt-text-truncate");
          const orderNumber = truncateEl
            ? (truncateEl.textContent ?? "").trim()
            : "";

          sendResponse({ success: true, orderNumber });
        } catch (error) {
          console.error("获取订单号失败:", error);
          sendResponse({
            success: false,
            orderNumber: "",
            error: error instanceof Error ? error.message : "未知错误",
          });
        }
        return true;
      }

      if (message.type === "DOWNLOAD_IMAGES_AS_ZIP") {
        const { urls, orderNumber } = message as {
          urls: string[];
          orderNumber: string;
        };
        if (!urls?.length) {
          sendResponse({ success: false, error: "没有选中图片" });
          return true;
        }

        (async () => {
          try {
            await injectScript("page-inject.js");
            const requestId = `fetch-images-zip-${Date.now()}-${Math.random()}`;

            const imagesBase64 = await new Promise<string[]>((resolve, reject) => {
              const timeout = setTimeout(() => {
                window.removeEventListener("message", handleResponse);
                reject(new Error("主世界拉取图片超时"));
              }, 60000);

              function handleResponse(event: MessageEvent) {
                if (event.source !== window) return;
                const data = event.data;
                if (
                  data?.type === "fetch-images-for-zip-response" &&
                  data.requestId === requestId
                ) {
                  clearTimeout(timeout);
                  window.removeEventListener("message", handleResponse);
                  if (data.success && Array.isArray(data.images)) {
                    resolve(data.images);
                  } else {
                    reject(new Error(data?.error ?? "拉取图片失败"));
                  }
                }
              }

              window.addEventListener("message", handleResponse);
              window.postMessage(
                { type: "fetch-images-for-zip", urls, requestId },
                "*"
              );
            });

            function getExt(url: string): string {
              try {
                const pathname = new URL(url, "https://x").pathname;
                const m = pathname.match(/\.(jpe?g|png|gif|webp|bmp)(\?|$)/i);
                return m ? m[1].toLowerCase() : "jpg";
              } catch {
                return "jpg";
              }
            }

            const zip = new JSZip();
            for (let i = 0; i < imagesBase64.length; i++) {
              const ext = getExt(urls[i]);
              zip.file(`image_${i + 1}.${ext}`, imagesBase64[i], { base64: true });
            }
            const zipBase64 = await zip.generateAsync({ type: "base64" });
            const filename =
              (orderNumber || "images").replace(/[/\\?*:|"]/g, "_") + ".zip";
            sendResponse({ success: true, zipBase64, filename });
          } catch (err) {
            sendResponse({
              success: false,
              error: err instanceof Error ? err.message : "打包失败",
            });
          }
        })();
        return true;
      }
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
