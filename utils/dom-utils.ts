/**
 * DOM 操作工具（隔离世界侧）
 * 真正的写入发生在主世界（public/page-inject.js），这里只负责跨世界调用与等待
 */
import { setEtsyInputValue, setEtsySelectOption } from "@/lib/etsy-bridge-client";
import type {
  EtsyDomInputSetData,
  EtsyDomSelectSetData,
} from "@/lib/etsy-bridge-types";

/** 订单号里可能出现引号，拼进属性选择器前必须转义，否则 querySelector 抛错 */
const escapeAttrValue = (value: string): string => value.replace(/["\\]/g, "\\$&");

export const trackingSelector = (orderNumber: string): string =>
  `[name="trackingCode-${escapeAttrValue(orderNumber)}"]`;

export const carrierNameSelector = (orderNumber: string): string =>
  `[name="carrierName-${escapeAttrValue(orderNumber)}"]`;

/**
 * 设置承运商下拉框。
 * 命中已有选项 → 选中；匹配不到 → 主世界回落到 Other(value=-1)，需另行填写 carrierName。
 */
export async function changeSelectOption(
  orderNumber: string,
  optionValue: string
): Promise<EtsyDomSelectSetData | null> {
  try {
    return await setEtsySelectOption({ orderNumber, optionValue });
  } catch (error) {
    console.warn(`⚠️ [隔离世界] 设置承运商失败（订单 ${orderNumber}）:`, error);
    return null;
  }
}

/**
 * 修改输入框的值，兼容 clg-text-input 等自定义元素宿主。
 * 返回 verified=false 表示写入后回读不一致（被页面框架回滚）。
 */
export async function changeInputValue(
  selector: string,
  value: string,
  triggerEvents: boolean = true
): Promise<EtsyDomInputSetData | null> {
  try {
    return await setEtsyInputValue({ selector, value, triggerEvents });
  } catch (error) {
    console.warn(`⚠️ [隔离世界] 写入输入框失败（${selector}）:`, error);
    return null;
  }
}

const isVisible = (element: HTMLElement): boolean => {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

/**
 * 轮询等待元素出现且可见（隔离世界与页面共享同一 DOM，可直接查询）
 */
export function waitForElement(
  selector: string,
  timeout: number = 2500,
  interval: number = 100
): Promise<HTMLElement | null> {
  const find = (): HTMLElement | null => {
    try {
      const element = document.querySelector<HTMLElement>(selector);
      return element && isVisible(element) ? element : null;
    } catch {
      return null;
    }
  };

  const existing = find();
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const element = find();
      if (element) {
        window.clearInterval(timer);
        resolve(element);
        return;
      }
      if (Date.now() - startedAt >= timeout) {
        window.clearInterval(timer);
        resolve(null);
      }
    }, interval);
  });
}
