/**
 * 注入到页面主世界的脚本
 * 用于直接访问页面的 window 对象，获取 Etsy 相关数据
 *
 * 注意：此脚本运行在页面主世界，与页面脚本共享同一个 JavaScript 上下文
 * 因此可以直接访问 window.Etsy 等页面对象
 */

(function () {
  "use strict";

  // 监听来自隔离世界（ISOLATED world）的 content script 的消息
  window.addEventListener("message", function (event) {
    // 确保消息来自当前窗口
    if (event.source !== window) return;

    // 检查消息类型
    if (event.data && event.data.type === "get-etsy-data") {
      try {
        // 在主世界中直接访问 window.Etsy.Context.data 对象
        const etsyData = window.Etsy?.Context?.data;

        if (etsyData) {
          const shopId = etsyData.shop_id;
          const orderStates = etsyData.order_states;

          console.log("✅ [主世界] 成功获取 Etsy 数据");
          console.log("📋 [主世界] shopId:", shopId);
          console.log("📋 [主世界] order_states 数量:", orderStates?.length || 0);

          // 发送响应回隔离世界
          window.postMessage(
            {
              type: "etsy-data-response",
              requestId: event.data.requestId,
              success: true,
              shopId: shopId,
              orderStates: orderStates,
            },
            "*"
          );
        } else {
          console.warn(
            "⚠️ [主世界] 无法获取 Etsy 数据，window.Etsy.Context.data 不存在"
          );

          // 发送错误响应
          window.postMessage(
            {
              type: "etsy-data-response",
              requestId: event.data.requestId,
              success: false,
              error: "无法获取 Etsy 数据，请确保在 Etsy 店铺管理页面打开此扩展",
            },
            "*"
          );
        }
      } catch (error) {
        console.error("❌ [主世界] 获取 Etsy 数据失败:", error);

        // 发送错误响应
        window.postMessage(
          {
            type: "etsy-data-response",
            requestId: event.data.requestId,
            success: false,
            error: error instanceof Error ? error.message : "未知错误",
          },
          "*"
        );
      }
    }
  });

  console.log("✅ [主世界] page-inject.js 已加载，可以访问 window.Etsy 对象");
})();
