/**
 * DOM 操作工具（隔离世界侧）
 * 真正的写入发生在主世界（public/page-inject.js），这里只负责跨世界调用与等待
 */
import {
  fillEtsyCarrierNamesBatch,
  fillEtsyOrdersBatch,
  scanEtsyOrderRows,
  setEtsyInputValue,
  setEtsySelectOption,
} from "@/lib/etsy-bridge-client";
import type {
  EtsyDomCarrierNamesFillData,
  EtsyDomCarrierNamesFillPayload,
  EtsyDomInputSetData,
  EtsyDomOrderFillData,
  EtsyDomOrderFillPayload,
  EtsyDomScanData,
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

/**
 * 一次性扫描页面可回填的订单行。
 * 提前调用可以把「订单是否在页面上」和「选承运商」两件事解耦，避免逐单全文档搜索。
 */
export async function scanOrderRows(): Promise<EtsyDomScanData | null> {
  try {
    return await scanEtsyOrderRows();
  } catch (error) {
    console.warn("⚠️ [隔离世界] 扫描订单行失败:", error);
    return null;
  }
}

/** 批量写入运单号 + 承运商下拉框（一批一次跨世界往返） */
export async function fillOrdersBatch(
  payload: EtsyDomOrderFillPayload
): Promise<EtsyDomOrderFillData | null> {
  try {
    return await fillEtsyOrdersBatch(payload);
  } catch (error) {
    console.warn("⚠️ [隔离世界] 批量写入运单号/承运商失败:", error);
    return null;
  }
}

/** 批量写入承运商名称（选中 Other 后才渲染的输入框） */
export async function fillCarrierNamesBatch(
  payload: EtsyDomCarrierNamesFillPayload
): Promise<EtsyDomCarrierNamesFillData | null> {
  try {
    return await fillEtsyCarrierNamesBatch(payload);
  } catch (error) {
    console.warn("⚠️ [隔离世界] 批量写入承运商名称失败:", error);
    return null;
  }
}

/**
 * 等待一批运单对应的承运商名称输入框渲染完成。
 * 用 isConnected 判断，不做 getBoundingClientRect，避免轮询触发强制布局。
 */
export function waitForCarrierNameInputs(
  orderNumbers: string[],
  options?: { timeoutMs?: number; intervalMs?: number }
): Promise<{ missing: string[]; elapsedMs: number }> {
  const timeoutMs = options?.timeoutMs ?? 4000;
  const intervalMs = options?.intervalMs ?? 50;
  const startedAt = Date.now();

  const collectMissing = (): string[] =>
    orderNumbers.filter((orderNumber) => {
      try {
        const element = document.querySelector(carrierNameSelector(orderNumber));
        return !element || !element.isConnected;
      } catch {
        return true;
      }
    });

  return new Promise((resolve) => {
    const tick = () => {
      const missing = collectMissing();
      const elapsedMs = Date.now() - startedAt;

      if (missing.length === 0 || elapsedMs >= timeoutMs) {
        resolve({ missing, elapsedMs });
        return;
      }

      window.setTimeout(tick, intervalMs);
    };

    tick();
  });
}

/** 让出一帧，等 Etsy 完成本轮 React 提交与绘制 */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== "function") {
      window.setTimeout(resolve, 16);
      return;
    }
    requestAnimationFrame(() => {
      window.setTimeout(resolve, 0);
    });
  });
}
