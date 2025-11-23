import { createApp } from "vue";
import ContentScriptWrapper from "@/components/ContentScriptWrapper.vue";

/**
 * 注入脚本到页面主世界
 * @param scriptPath 脚本路径
 */
function injectScript(scriptPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // 检查脚本是否已经注入
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
      // 确保注入脚本已加载
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
  matches: ["*://*/*"],
  runAt: "document_end",
  registration: "manifest",
  main() {
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
