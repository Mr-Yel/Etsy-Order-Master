/**
 * DOM 操作工具函数
 */

/**
 * 修改 select 下拉框的选中选项
 * @param selector - 元素选择器（如 '#onboard-shop-language' 或 '.select'）
 * @param optionValue - 要选中的选项值（如 'ja' 或 '日本語'）
 * @param matchBy - 匹配方式：'value' 按 value 属性匹配，'text' 按文本内容匹配，'both' 两种方式都尝试
 * @returns 是否成功修改
 */
export function changeSelectOption(
  selector: string,
  optionValue: string,
  matchBy: 'value' | 'text' | 'both' = 'both'
): boolean {
  try {
    // 查找 select 元素
    const select = document.querySelector(selector) as HTMLSelectElement;
    
    if (!select) {
      console.warn(`未找到选择器 "${selector}" 对应的 select 元素`);
      return false;
    }

    // 如果 matchBy 是 'both'，先尝试按 value 匹配，失败再按 text 匹配
    if (matchBy === 'both') {
      // 先尝试按 value 匹配
      if (trySelectByValue(select, optionValue)) {
        return true;
      }
      // 再尝试按 text 匹配
      if (trySelectByText(select, optionValue)) {
        return true;
      }
    } else if (matchBy === 'value') {
      if (trySelectByValue(select, optionValue)) {
        return true;
      }
    } else if (matchBy === 'text') {
      if (trySelectByText(select, optionValue)) {
        return true;
      }
    }

    console.warn(`在 select "${selector}" 中未找到值为 "${optionValue}" 的选项`);
    return false;
  } catch (error) {
    console.error('修改 select 选项时发生错误:', error);
    return false;
  }
}

/**
 * 按 value 属性匹配并选中选项
 */
function trySelectByValue(select: HTMLSelectElement, value: string): boolean {
  const option = Array.from(select.options).find(
    (opt) => opt.value === value
  );
  
  if (option) {
    select.value = value;
    // 触发 change 事件，确保页面 JavaScript 能感知到变化
    triggerChangeEvent(select);
    console.log(`✅ 成功将 select 切换为选项值: ${value}`);
    return true;
  }
  
  return false;
}

/**
 * 按文本内容匹配并选中选项
 */
function trySelectByText(select: HTMLSelectElement, text: string): boolean {
  const option = Array.from(select.options).find(
    (opt) => opt.textContent?.trim() === text.trim() || opt.text?.trim() === text.trim()
  );
  
  if (option) {
    select.value = option.value;
    // 触发 change 事件，确保页面 JavaScript 能感知到变化
    triggerChangeEvent(select);
    console.log(`✅ 成功将 select 切换为选项文本: ${text} (值: ${option.value})`);
    return true;
  }
  
  return false;
}

/**
 * 触发 change 事件
 */
function triggerChangeEvent(select: HTMLSelectElement): void {
  // 创建并派发 change 事件
  const changeEvent = new Event('change', {
    bubbles: true,
    cancelable: true,
  });
  select.dispatchEvent(changeEvent);

  // 也触发 input 事件（某些网站可能监听这个）
  const inputEvent = new Event('input', {
    bubbles: true,
    cancelable: true,
  });
  select.dispatchEvent(inputEvent);
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
  selector: string,
  optionValue: string,
  matchBy: 'value' | 'text' | 'both' = 'both',
  timeout: number = 5000
): Promise<boolean> {
  return new Promise((resolve) => {
    // 先尝试立即执行
    if (changeSelectOption(selector, optionValue, matchBy)) {
      resolve(true);
      return;
    }

    // 如果找不到，使用 MutationObserver 等待元素出现
    const observer = new MutationObserver(() => {
      if (changeSelectOption(selector, optionValue, matchBy)) {
        observer.disconnect();
        resolve(true);
      }
    });

    // 开始观察
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // 设置超时
    setTimeout(() => {
      observer.disconnect();
      console.warn(`等待 select "${selector}" 出现超时（${timeout}ms）`);
      resolve(false);
    }, timeout);
  });
}

/**
 * 获取 select 元素的所有选项信息（用于调试）
 * @param selector - 元素选择器
 * @returns 选项信息数组
 */
export function getSelectOptions(selector: string): Array<{ value: string; text: string }> {
  const select = document.querySelector(selector) as HTMLSelectElement;
  
  if (!select) {
    console.warn(`未找到选择器 "${selector}" 对应的 select 元素`);
    return [];
  }

  return Array.from(select.options).map((opt) => ({
    value: opt.value,
    text: opt.textContent?.trim() || opt.text?.trim() || '',
  }));
}

