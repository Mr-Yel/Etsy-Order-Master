/**
 * DOM 操作工具函数
 */

/**
 * 修改 select 下拉框的选中选项
 * 通过 postMessage 与页面主世界通信，确保事件能被页面监听器捕获
 * @param orderNumber - 订单号
 * @param optionValue - 要选中的选项文本（如 'USPS'）
 * @returns Promise<boolean> 是否成功修改
 */
export function changeSelectOption(orderNumber: string, optionValue: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      // 生成唯一的请求 ID
      const requestId = `change-select-${Date.now()}-${Math.random()}`;

      // 设置超时
      const timeout = setTimeout(() => {
        window.removeEventListener("message", handleResponse);
        console.warn("⚠️ [隔离世界] 修改 select 选项超时");
        resolve(false);
      }, 3000); // 3秒超时

      // 处理响应
      function handleResponse(event: MessageEvent) {
        // 确保消息来自当前窗口
        if (event.source !== window) return;

        // 检查消息类型和请求 ID
        if (
          event.data &&
          event.data.type === "change-select-option-response" &&
          event.data.requestId === requestId
        ) {
          clearTimeout(timeout);
          window.removeEventListener("message", handleResponse);

          if (event.data.success) {
            console.log(`✅ [隔离世界] 成功修改 select 选项: ${optionValue}`);
            resolve(true);
          } else {
            console.warn(`⚠️ [隔离世界] 修改 select 选项失败:`, event.data.error);
            resolve(false);
          }
        }
      }

      // 监听响应消息
      window.addEventListener("message", handleResponse);

      // 发送请求到主世界
      window.postMessage(
        {
          type: "change-select-option",
          requestId: requestId,
          orderNumber: orderNumber,
          optionValue: optionValue,
        },
        "*"
      );
    } catch (error) {
      console.error("❌ [隔离世界] 修改 select 选项时发生错误:", error);
      resolve(false);
    }
  });
}

/**
 * 尝试选择选项（参考项目的核心逻辑）
 */
function trySelectOption(
  select: HTMLSelectElement,
  optionText: string,
  identifier: string
): boolean {
  // 参考项目：遍历所有选项，按文本不区分大小写匹配
  const options = select.options;
  let matched = false;

  for (let i = 0; i < options.length; i++) {
    // 参考项目：t[e].text.toLowerCase() == r[a].toLowerCase()
    if (options[i].text.toLowerCase() === optionText.toLowerCase()) {
      // 参考项目：n.value = t[e].value; n.dispatchEvent(new Event("change"))
      select.value = options[i].value;
      select.dispatchEvent(new Event("change"));
      matched = true;
      console.log(
        `✅ 成功将 select "${identifier}" 切换为选项: ${optionText} (值: ${options[i].value})`
      );
      break;
    }
  }

  // 参考项目：如果找不到，设置 -1 并触发动态加载
  if (!matched) {
    // 参考项目：n.value = -1, n.dispatchEvent(new Event("change"))
    select.value = "-1";
    select.dispatchEvent(new Event("change"));

    // 参考项目：从 name 中提取 orderNumber（假设格式为 carrierNameSelect-{orderNumber}）
    const orderNumberMatch = identifier.match(/carrierNameSelect-(\d+)/);
    if (orderNumberMatch) {
      const orderNumber = orderNumberMatch[1];
      // 参考项目：使用 MutationObserver 监听新元素出现
      handleDynamicOptionLoading(select, orderNumber, optionText);
    } else {
      console.warn(`⚠️ 无法从 "${identifier}" 中提取订单号，无法处理动态选项`);
    }
  }

  return matched;
}

/**
 * 处理动态选项加载（参考项目的降级策略）
 * 如果找不到选项，设置 -1 触发动态加载，然后用 MutationObserver 监听新元素出现
 * 参考项目逻辑：设置 -1 -> 触发 change -> 监听 carrierName-{orderNumber} 出现 -> 设置值 -> requestAnimationFrame 触发 change
 */
function handleDynamicOptionLoading(
  select: HTMLSelectElement,
  orderNumber: string,
  optionValue: string
): void {
  // 参考项目：使用 MutationObserver 监听新元素出现
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // 参考项目：if ("childList" === o.type)
      if (mutation.type === "childList") {
        // 参考项目：let t = document.getElementsByName(`carrierName-${e[a]}`)[0]
        const targetElement = document.getElementsByName(
          `carrierName-${orderNumber}`
        )[0] as HTMLInputElement | HTMLSelectElement | null;

        if (targetElement) {
          // 参考项目：t.value = r[a]
          targetElement.value = optionValue;

          // 参考项目：wr(() => { t.dispatchEvent(new Event("change")), f.push(t); })
          // wr 可能是 requestAnimationFrame 或 setTimeout 的包装
          requestAnimationFrame(() => {
            const changeEvent = new Event("change");
            targetElement.dispatchEvent(changeEvent);
          });

          // 参考项目：void n.disconnect()
          observer.disconnect();

          console.log(
            `✅ 动态加载成功：找到目标元素 "carrierName-${orderNumber}" 并设置值为 "${optionValue}"`
          );
          return;
        }
      }
    }
  });

  // 参考项目：t.observe(document, { childList: !0, subtree: !0 })
  observer.observe(document, {
    childList: true,
    subtree: true,
  });
}

/**
 * 等待元素出现并修改 select 选项
 * @param selector - 元素选择器
 * @param optionValue - 要选中的选项值
 * @param matchBy - 匹配方式
 * @param timeout - 超时时间（毫秒），默认 10 秒
 * @returns Promise<boolean> 是否成功修改
 */
export function changeSelectOptionWhenReady(
  orderNumber: string,
  optionValue: string,
  timeout: number = 2000
): Promise<boolean> {
  return new Promise(async (resolve) => {
    // 先尝试立即执行
    const immediateResult = await changeSelectOption(orderNumber, optionValue);
    if (immediateResult) {
      resolve(true);
      return;
    }

    // 如果找不到，使用防抖的 MutationObserver 等待元素出现
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isResolved = false;

    const checkAndUpdate = async () => {
      if (isResolved) return;

      const result = await changeSelectOption(orderNumber, optionValue);
      if (result) {
        isResolved = true;
        if (timeoutId) clearTimeout(timeoutId);
        observer.disconnect();
        resolve(true);
      }
    };

    // 使用防抖，避免频繁调用
    const debouncedCheck = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(checkAndUpdate, 50); // 50ms 防抖
    };

    const observer = new MutationObserver(debouncedCheck);

    // 开始观察（只观察子节点变化，减少性能开销）
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // 设置超时
    setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        if (timeoutId) clearTimeout(timeoutId);
        observer.disconnect();
        console.warn(`等待 select "${orderNumber}" 出现超时（${timeout}ms）`);
        resolve(false);
      }
    }, timeout);
  });
}

/**
 * 获取 select 元素的所有选项信息（用于调试）
 * @param selector - 元素选择器
 * @returns 选项信息数组
 */
export function getSelectOptions(
  selector: string
): Array<{ value: string; text: string }> {
  const select = document.querySelector(selector) as HTMLSelectElement;

  if (!select) {
    console.warn(`未找到选择器 "${selector}" 对应的 select 元素`);
    return [];
  }

  return Array.from(select.options).map((opt) => ({
    value: opt.value,
    text: opt.textContent?.trim() || opt.text?.trim() || "",
  }));
}

/**
 * 修改 input[type="text"] 输入框的值
 * 通过 postMessage 与页面主世界通信，确保事件能被页面监听器捕获
 * @param selector - 元素选择器（如 '#username' 或 'input[name="email"]'）
 * @param value - 要设置的值
 * @param triggerEvents - 是否触发事件（input, change, blur），默认 true
 * @returns Promise<boolean> 是否成功修改
 */
export function changeInputValue(
  selector: string,
  value: string,
  triggerEvents: boolean = true
): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      // 生成唯一的请求 ID
      const requestId = `change-input-${Date.now()}-${Math.random()}`;

      // 设置超时
      const timeout = setTimeout(() => {
        window.removeEventListener("message", handleResponse);
        console.warn("⚠️ [隔离世界] 修改 input 值超时");
        resolve(false);
      }, 3000); // 3秒超时

      // 处理响应
      function handleResponse(event: MessageEvent) {
        // 确保消息来自当前窗口
        if (event.source !== window) return;

        // 检查消息类型和请求 ID
        if (
          event.data &&
          event.data.type === "change-input-value-response" &&
          event.data.requestId === requestId
        ) {
          clearTimeout(timeout);
          window.removeEventListener("message", handleResponse);

          if (event.data.success) {
            console.log(`✅ [隔离世界] 成功修改 input 值: ${value}`);
            resolve(true);
          } else {
            console.warn(`⚠️ [隔离世界] 修改 input 值失败:`, event.data.error);
            resolve(false);
          }
        }
      }

      // 监听响应消息
      window.addEventListener("message", handleResponse);

      // 发送请求到主世界
      window.postMessage(
        {
          type: "change-input-value",
          requestId: requestId,
          selector: selector,
          value: value,
          triggerEvents: triggerEvents,
        },
        "*"
      );
    } catch (error) {
      console.error("❌ [隔离世界] 修改 input 值时发生错误:", error);
      resolve(false);
    }
  });
}

/**
 * 触发 input 相关事件
 */
function triggerInputEvents(input: HTMLInputElement): void {
  // 触发 focus 事件（模拟用户聚焦）
  const focusEvent = new Event("focus", {
    bubbles: true,
    cancelable: true,
  });
  input.dispatchEvent(focusEvent);

  // 触发 input 事件（最常用，实时监听输入）
  const inputEvent = new Event("input", {
    bubbles: true,
    cancelable: true,
  });
  input.dispatchEvent(inputEvent);

  // 触发 change 事件（值改变时）
  const changeEvent = new Event("change", {
    bubbles: true,
    cancelable: true,
  });
  input.dispatchEvent(changeEvent);

  // 触发 blur 事件（模拟失去焦点，某些表单验证需要）
  const blurEvent = new Event("blur", {
    bubbles: true,
    cancelable: true,
  });
  input.dispatchEvent(blurEvent);
}

/**
 * 等待元素出现并修改 input 的值
 * @param selector - 元素选择器
 * @param value - 要设置的值
 * @param triggerEvents - 是否触发事件
 * @param timeout - 超时时间（毫秒），默认 5 秒
 * @returns Promise<boolean> 是否成功修改
 */
export function changeInputValueWhenReady(
  selector: string,
  value: string,
  triggerEvents: boolean = true,
  timeout: number = 2000
): Promise<boolean> {
  return new Promise(async (resolve) => {
    // 先尝试立即执行
    const immediateResult = await changeInputValue(selector, value, triggerEvents);
    if (immediateResult) {
      resolve(true);
      return;
    }

    // 如果找不到，使用防抖的 MutationObserver 等待元素出现
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isResolved = false;

    const checkAndUpdate = async () => {
      if (isResolved) return;

      const result = await changeInputValue(selector, value, triggerEvents);
      if (result) {
        isResolved = true;
        if (timeoutId) clearTimeout(timeoutId);
        observer.disconnect();
        resolve(true);
      }
    };

    // 使用防抖，避免频繁调用
    const debouncedCheck = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(checkAndUpdate, 50); // 50ms 防抖
    };

    const observer = new MutationObserver(debouncedCheck);

    // 开始观察（只观察子节点变化，减少性能开销）
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // 设置超时
    setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        if (timeoutId) clearTimeout(timeoutId);
        observer.disconnect();
        console.warn(`等待 input "${selector}" 出现超时（${timeout}ms）`);
        resolve(false);
      }
    }, timeout);
  });
}
