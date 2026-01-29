import { createApp } from "vue";
import JSZip from "jszip";
import ContentScriptWrapper from "@/components/ContentScriptWrapper.vue";

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
        // 如果 body 还不存在，等待一下再试
        setTimeout(init, 100);
      }
    };

    // 如果 DOM 已经准备好，立即执行
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      // DOM 已经加载完成
      init();
    }
  },
});
