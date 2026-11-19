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
import { getRuntimeScopedId } from "@/lib/runtime-identity";

/** 订单号里可能出现引号，拼进属性选择器前必须转义，否则 querySelector 抛错 */
const escapeAttrValue = (value: string): string => value.replace(/["\\]/g, "\\$&");

export const trackingSelector = (orderNumber: string): string =>
  `[name="trackingCode-${escapeAttrValue(orderNumber)}"]`;

export const carrierSelectSelector = (orderNumber: string): string =>
  `[name="carrierNameSelect-${escapeAttrValue(orderNumber)}"]`;

export const carrierNameSelector = (orderNumber: string): string =>
  `[name="carrierName-${escapeAttrValue(orderNumber)}"]`;

const ORDER_NUMBER_LABEL_CLASS = "eom-order-number-label";
const ORDER_COUNT_LABEL_CLASS = "eom-order-count-label";
const ORDER_COUNT_OWNER_ATTRIBUTE = "data-eom-order-count-owner";
const ORDER_COUNT_STATE_ATTRIBUTE = "data-eom-order-count-state";
const ORDER_ERROR_ATTRIBUTE = getRuntimeScopedId("data-eom-order-row-error");
const ORDER_ERROR_CLASS = getRuntimeScopedId("eom-order-row-has-error");
const ORDER_ERROR_REASON_CLASS = getRuntimeScopedId(
  "eom-order-row-error-reason"
);
const ANNOTATION_STYLE_ID = getRuntimeScopedId("eom-order-row-annotation-style");

export type OrderRowIssue = {
  orderNumber: string;
  reason: string;
};

export type OrderRowAnnotationResult = {
  annotated: number;
  marked: number;
  missingOrderNumbers: string[];
};

export type OrderCountLabelState = {
  total: number;
  filled: number;
  owner: string;
  claim?: boolean;
};

/** 为 Etsy 订单卡片追加订单号，并把异常原因显示在对应卡片下方 */
export function annotateOrderRows(
  issues: OrderRowIssue[] = []
): OrderRowAnnotationResult {
  ensureAnnotationStyles();

  const issueMap = new Map<string, string[]>();
  for (const issue of issues) {
    const orderNumber = issue.orderNumber.trim();
    const reason = issue.reason.trim();
    if (!orderNumber || !reason) continue;

    const reasons = issueMap.get(orderNumber) ?? [];
    if (!reasons.includes(reason)) {
      reasons.push(reason);
      issueMap.set(orderNumber, reasons);
    }
  }

  const seen = new Set<string>();
  const orderNumbers = [
    ...collectOrderNumbersByPrefix("trackingCode-"),
    ...collectOrderNumbersByPrefix("carrierNameSelect-"),
  ].filter((orderNumber) => {
    if (seen.has(orderNumber)) return false;
    seen.add(orderNumber);
    return true;
  });

  const found = new Set<string>();
  const activePanels = new Set<HTMLElement>();
  let annotated = 0;
  let marked = 0;

  for (const orderNumber of orderNumbers) {
    const panel = findOrderPanel(orderNumber);
    if (!panel) continue;

    found.add(orderNumber);
    activePanels.add(panel);
    annotateCustomerBlock(panel, orderNumber);
    annotated += 1;

    const reasons = issueMap.get(orderNumber);
    if (reasons?.length) {
      const reasonText = reasons.join("；");
      markOrderError(panel, reasonText);
      marked += 1;
    } else {
      clearOrderError(panel);
    }
  }

  clearStaleAnnotations(activePanels);

  return {
    annotated,
    marked,
    missingOrderNumbers: Array.from(issueMap.keys()).filter(
      (orderNumber) => !found.has(orderNumber)
    ),
  };
}

function markOrderError(panel: HTMLElement, reasonText: string): void {
  panel.classList.add(ORDER_ERROR_CLASS);
  panel.setAttribute(ORDER_ERROR_ATTRIBUTE, reasonText);

  let reasonElement = panel.querySelector<HTMLElement>(
    `:scope > .${ORDER_ERROR_REASON_CLASS}`
  );
  if (!reasonElement) {
    reasonElement = document.createElement("div");
    reasonElement.className = ORDER_ERROR_REASON_CLASS;
    panel.appendChild(reasonElement);
  }

  const reasonContent = `异常原因：${reasonText}`;
  if (reasonElement.textContent !== reasonContent) {
    reasonElement.textContent = reasonContent;
  }
}

function clearOrderError(panel: HTMLElement): void {
  panel.classList.remove(ORDER_ERROR_CLASS);
  panel.removeAttribute(ORDER_ERROR_ATTRIBUTE);
  panel
    .querySelectorAll<HTMLElement>(`:scope > .${ORDER_ERROR_REASON_CLASS}`)
    .forEach((element) => element.remove());
}

function clearStaleAnnotations(activePanels: Set<HTMLElement>): void {
  document
    .querySelectorAll<HTMLElement>(`.${ORDER_NUMBER_LABEL_CLASS}`)
    .forEach((element) => {
      const panel =
        element.closest<HTMLElement>('[data-clg-id="WtPanel"]') ??
        element.closest<HTMLElement>(".wt-panel");
      if (!panel || !activePanels.has(panel)) {
        element.remove();
      }
    });
  document
    .querySelectorAll<HTMLElement>(`.${ORDER_ERROR_CLASS}`)
    .forEach((panel) => {
      if (!activePanels.has(panel)) {
        clearOrderError(panel);
      }
    });
  document
    .querySelectorAll<HTMLElement>(`.${ORDER_ERROR_REASON_CLASS}`)
    .forEach((element) => {
      const panel =
        element.closest<HTMLElement>('[data-clg-id="WtPanel"]') ??
        element.closest<HTMLElement>(".wt-panel");
      if (!panel || !activePanels.has(panel)) {
        element.remove();
      }
    });
}

function collectOrderNumbersByPrefix(prefix: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const nodes = document.querySelectorAll<HTMLElement>(
    `[name^="${prefix}"]`
  );

  nodes.forEach((node) => {
    const name = node.getAttribute("name") ?? "";
    if (!name.startsWith(prefix)) return;

    const orderNumber = name.slice(prefix.length);
    if (!orderNumber || seen.has(orderNumber)) return;
    seen.add(orderNumber);
    result.push(orderNumber);
  });

  return result;
}

function findOrderPanel(orderNumber: string): HTMLElement | null {
  const selectors = [
    trackingSelector(orderNumber),
    carrierSelectSelector(orderNumber),
    carrierNameSelector(orderNumber),
  ];

  for (const selector of selectors) {
    const anchor = document.querySelector<HTMLElement>(selector);
    if (!anchor) continue;

    const panel =
      anchor.closest<HTMLElement>('[data-clg-id="WtPanel"]') ??
      anchor.closest<HTMLElement>(".wt-panel");
    if (panel) return panel;
  }

  return null;
}

function annotateCustomerBlock(panel: HTMLElement, orderNumber: string): void {
  const customerBlock = panel.querySelector<HTMLElement>(
    ".wt-grid > .wt-grid__item-md-4"
  );
  if (!customerBlock) return;

  const existingLabel = customerBlock.querySelector<HTMLElement>(
    `:scope > .${ORDER_NUMBER_LABEL_CLASS}`
  );
  if (existingLabel) {
    const labelText = `订单号：${orderNumber}`;
    if (existingLabel.textContent !== labelText) {
      existingLabel.textContent = labelText;
    }
    return;
  }

  const label = document.createElement("div");
  label.className = ORDER_NUMBER_LABEL_CLASS;
  label.textContent = `订单号：${orderNumber}`;
  label.style.setProperty("user-select", "text", "important");
  label.style.setProperty("-webkit-user-select", "text", "important");
  customerBlock.appendChild(label);
}

/** 在 Orders 标题右侧同步当前表单填写进度；两个运行环境共用一个展示节点 */
export function updateOrderCountLabel(state: OrderCountLabelState): void {
  if (state.total <= 0) return;

  const heading = findOrdersHeading();
  if (!heading) return;

  const labels = document.querySelectorAll<HTMLElement>(
    `.${ORDER_COUNT_LABEL_CLASS}`
  );
  let label = labels[0] ?? null;
  labels.forEach((item, index) => {
    if (index > 0) item.remove();
  });

  const currentOwner = label?.getAttribute(ORDER_COUNT_OWNER_ATTRIBUTE) ?? "";
  const canUpdate =
    !label || currentOwner === state.owner || Boolean(state.claim);
  if (!canUpdate) {
    if (label && label.parentElement !== heading) {
      heading.appendChild(label);
    }
    return;
  }

  if (!label) {
    label = document.createElement("span");
    label.className = ORDER_COUNT_LABEL_CLASS;
    label.style.setProperty("user-select", "text", "important");
    label.style.setProperty("-webkit-user-select", "text", "important");
  }

  label.setAttribute(ORDER_COUNT_OWNER_ATTRIBUTE, state.owner);
  const filled = Math.max(0, Math.min(state.filled, state.total));
  const text = `填写订单数量 ${filled}/${state.total}`;
  if (label.textContent !== text) {
    label.textContent = text;
  }
  label.setAttribute(
    ORDER_COUNT_STATE_ATTRIBUTE,
    filled > 0 ? "has-filled" : "empty"
  );

  if (label.parentElement !== heading) {
    heading.appendChild(label);
  }
}

function findOrdersHeading(): HTMLElement | null {
  const headings = document.querySelectorAll<HTMLElement>(
    "#mark-as-complete-overlay h1, #mark-as-complete-overlay h2, #mark-as-complete-overlay h3, #mark-as-complete-overlay h4, #mark-as-complete-overlay h5"
  );

  for (const heading of headings) {
    const headingText = heading.cloneNode(true) as HTMLElement;
    headingText
      .querySelectorAll(`.${ORDER_COUNT_LABEL_CLASS}`)
      .forEach((label) => label.remove());
    if ((headingText.textContent ?? "").trim() !== "Orders") continue;
    const rect = heading.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return heading;
    }
  }

  return null;
}

function ensureAnnotationStyles(): void {
  if (document.getElementById(ANNOTATION_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = ANNOTATION_STYLE_ID;
  style.textContent = `
    .${ORDER_NUMBER_LABEL_CLASS} {
      display: block;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed #cbd5e1;
      color: #334155;
      font-size: 13px;
      font-weight: 600;
      line-height: 1.45;
      white-space: normal;
      word-break: break-all;
      cursor: text;
      user-select: text !important;
      -webkit-user-select: text !important;
    }

    .${ORDER_COUNT_LABEL_CLASS} {
      display: inline-flex !important;
      align-items: center;
      margin-left: 12px;
      padding: 4px 9px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #f8fafc;
      color: #334155;
      font-size: 13px;
      font-weight: 600;
      line-height: 1.35;
      vertical-align: middle;
      white-space: nowrap;
      user-select: text !important;
      -webkit-user-select: text !important;
    }

    .${ORDER_COUNT_LABEL_CLASS}[${ORDER_COUNT_STATE_ATTRIBUTE}="has-filled"] {
      border-color: #86efac;
      background: #f0fdf4;
      color: #166534;
    }

    [data-clg-id="WtPanel"].${ORDER_ERROR_CLASS} {
      outline: 2px solid #dc2626 !important;
      outline-offset: 2px;
      background-color: #fff5f5 !important;
    }

    .${ORDER_ERROR_REASON_CLASS} {
      display: block;
      box-sizing: border-box;
      width: 100%;
      margin-top: 16px;
      padding: 10px 12px;
      border: 1px solid #fca5a5;
      border-left: 4px solid #dc2626;
      border-radius: 6px;
      background: #fef2f2;
      color: #b91c1c;
      font-size: 13px;
      font-weight: 600;
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-word;
      user-select: text !important;
      -webkit-user-select: text !important;
    }
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

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
