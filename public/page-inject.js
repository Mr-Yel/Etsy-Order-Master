/**
 * 注入到页面主世界的脚本
 * 用于直接访问页面的 window 对象，获取 Etsy 相关数据
 *
 * 注意：此脚本运行在页面主世界，与页面脚本共享同一个 JavaScript 上下文
 * 因此可以直接访问 window.Etsy 等页面对象
 */

(function () {
  "use strict";

  /**
   * 在主世界中修改 select 下拉框的选中选项
   * 这样可以确保事件能被页面主世界的监听器捕获
   */
  function changeSelectOptionInMainWorld(orderNumber, optionValue) {
    try {
      const selectElement = document.getElementsByName(`carrierNameSelect-${orderNumber}`)[0];
      
      if (!selectElement) {
        return { success: false, error: "未找到 select 元素" };
      }

      const options = selectElement.options;
      
      // 遍历所有选项，按文本不区分大小写匹配
      for (let i = 0; i < options.length; i++) {
        if (options[i].text.toLowerCase() === optionValue.toLowerCase()) {
          // 设置值
          selectElement.value = options[i].value;
          
          // 在主世界中触发事件，确保能被页面监听器捕获
          // 使用多种事件类型确保兼容性
          const changeEvent = new Event("change", { bubbles: true, cancelable: true });
          selectElement.dispatchEvent(changeEvent);
          
          // 也触发 input 事件（某些框架可能需要）
          const inputEvent = new Event("input", { bubbles: true, cancelable: true });
          selectElement.dispatchEvent(inputEvent);
          
          return { success: true, value: options[i].value };
        }
      }
      
      return { success: false, error: "未找到匹配的选项" };
    } catch (error) {
      console.error("❌ [主世界] 修改 select 选项时发生错误:", error);
      return { success: false, error: error.message || "未知错误" };
    }
  }

  /**
   * 在主世界中修改 input 输入框的值
   */
  function changeInputValueInMainWorld(selector, value, triggerEvents) {
    try {
      const input = document.querySelector(selector);
      
      if (!input) {
        return { success: false, error: "未找到 input 元素" };
      }

      // 设置值
      input.value = value;

      // 触发事件
      if (triggerEvents !== false) {
        const events = ["focus", "input", "change", "blur"];
        events.forEach(eventType => {
          const event = new Event(eventType, { bubbles: true, cancelable: true });
          input.dispatchEvent(event);
        });
      }

      return { success: true };
    } catch (error) {
      console.error("❌ [主世界] 修改 input 值时发生错误:", error);
      return { success: false, error: error.message || "未知错误" };
    }
  }

  // 监听来自隔离世界（ISOLATED world）的 content script 的消息
  window.addEventListener("message", function (event) {
    // 确保消息来自当前窗口
    if (event.source !== window) return;

    // 处理获取 Etsy 数据的请求
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

    // 处理修改 select 选项的请求
    if (event.data && event.data.type === "change-select-option") {
      const { orderNumber, optionValue, requestId } = event.data;
      const result = changeSelectOptionInMainWorld(orderNumber, optionValue);
      
      // 发送响应回隔离世界
      window.postMessage(
        {
          type: "change-select-option-response",
          requestId: requestId,
          ...result,
        },
        "*"
      );
    }

    // 处理修改 input 值的请求
    if (event.data && event.data.type === "change-input-value") {
      const { selector, value, triggerEvents, requestId } = event.data;
      const result = changeInputValueInMainWorld(selector, value, triggerEvents);
      
      // 发送响应回隔离世界
      window.postMessage(
        {
          type: "change-input-value-response",
          requestId: requestId,
          ...result,
        },
        "*"
      );
    }
  });

  console.log("✅ [主世界] page-inject.js 已加载，可以访问 window.Etsy 对象和 DOM 操作");
})();
