import { getRuntimeScopedMessageType } from "./runtime-identity";

export const ETSY_BRIDGE_REQUEST_TYPE = getRuntimeScopedMessageType(
  "ETSY_BRIDGE_REQUEST"
);
export const ETSY_BRIDGE_RESPONSE_TYPE = getRuntimeScopedMessageType(
  "ETSY_BRIDGE_RESPONSE"
);
export const ETSY_BRIDGE_EVENT_TYPE = getRuntimeScopedMessageType(
  "ETSY_BRIDGE_EVENT"
);

export const ETSY_MOVE_ORDERS_REQUEST_TYPE = getRuntimeScopedMessageType(
  "etsy-move-orders-request"
);
export const ETSY_MOVE_ORDERS_RESPONSE_TYPE = getRuntimeScopedMessageType(
  "etsy-move-orders-response"
);
export const ETSY_UPDATE_SHIP_BY_DATE_REQUEST_TYPE =
  getRuntimeScopedMessageType("etsy-update-ship-by-date-request");
export const ETSY_UPDATE_SHIP_BY_DATE_RESPONSE_TYPE =
  getRuntimeScopedMessageType("etsy-update-ship-by-date-response");

export const ETSY_BRIDGE_VERSION = 1 as const;

export const ETSY_BRIDGE_ACTIONS = {
  contextGet: "context.get",
  domSelectSet: "dom.select.set",
  domInputSet: "dom.input.set",
  domScan: "dom.scan",
  domOrderFill: "dom.order.fill",
  domCarrierNamesFill: "dom.carrierNames.fill",
  imagesFetchAsBase64: "images.fetchAsBase64",
} as const;

export type EtsyBridgeAction =
  (typeof ETSY_BRIDGE_ACTIONS)[keyof typeof ETSY_BRIDGE_ACTIONS];

export type EtsyBridgeSource = "popup" | "content" | "background" | "page";

export type EtsyBridgeMeta = {
  source: EtsyBridgeSource;
  version: typeof ETSY_BRIDGE_VERSION;
  timestamp: number;
  timeoutMs?: number;
};

export type EtsyBridgeRequest<TPayload = unknown> = {
  type: typeof ETSY_BRIDGE_REQUEST_TYPE;
  requestId: string;
  action: EtsyBridgeAction;
  payload: TPayload;
  meta: EtsyBridgeMeta;
};

export type EtsyBridgeError = {
  code: string;
  message: string;
  retryable?: boolean;
  details?: unknown;
};

export type EtsyBridgeSuccessResponse<TData = unknown> = {
  type: typeof ETSY_BRIDGE_RESPONSE_TYPE;
  requestId: string;
  success: true;
  data: TData;
};

export type EtsyBridgeErrorResponse = {
  type: typeof ETSY_BRIDGE_RESPONSE_TYPE;
  requestId: string;
  success: false;
  error: EtsyBridgeError;
};

export type EtsyBridgeResponse<TData = unknown> =
  | EtsyBridgeSuccessResponse<TData>
  | EtsyBridgeErrorResponse;

export type EtsyBridgeEvent<TPayload = unknown> = {
  type: typeof ETSY_BRIDGE_EVENT_TYPE;
  event: string;
  payload: TPayload;
  meta: {
    source: EtsyBridgeSource;
    version: typeof ETSY_BRIDGE_VERSION;
    timestamp: number;
  };
};

export type EtsyContextGetPayload = Record<string, never>;

export type EtsyBridgeOrderState = {
  type: string;
  order_state_id: number;
  client_id: number | null;
  position: number;
  name: string;
  state_type: string;
  order_count: number | null;
  actions: string[];
};

export type EtsyContextGetData = {
  raw: unknown;
  shopId?: number;
  orderStates?: EtsyBridgeOrderState[];
};

export type EtsyDomSelectSetPayload = {
  orderNumber: string;
  optionValue: string;
};

/** select 写入结果：matched=false 表示未命中已有承运商，已回落到 Other(value=-1) */
export type EtsyDomSelectSetData = {
  success: true;
  value: string;
  text: string;
  matched: boolean;
  fallbackToOther: boolean;
};

export type EtsyDomInputSetPayload = {
  selector: string;
  value: string;
  triggerEvents?: boolean;
};

/** verified 表示写入后立即回读是否等于期望值（false 说明被框架回滚了） */
export type EtsyDomInputSetData = {
  success: true;
  verified: boolean;
  readback: string;
};

/** 扫描页面上可回填的订单行（一次性查询，避免逐单全文档搜索） */
export type EtsyDomScanData = {
  /** 页面上存在运单号输入框或承运商下拉框的订单号 */
  orderNumbers: string[];
  /** 有运单号输入框的订单号 */
  trackingOrderNumbers: string[];
  /** 有承运商下拉框的订单号 */
  selectOrderNumbers: string[];
  /** 有承运商名称输入框（Other 分支）的订单号 */
  carrierNameOrderNumbers: string[];
};

export type EtsyDomOrderFillPayload = {
  orders: Array<{
    orderNumber: string;
    trackingNumber?: string;
    carrierText?: string;
  }>;
};

export type EtsyDomOrderFillItemResult = {
  orderNumber: string;
  tracking?: {
    ok: boolean;
    reason?: string;
    readback?: string;
  };
  carrier?: {
    ok: boolean;
    reason?: string;
    /** 命中已有承运商选项 */
    matched?: boolean;
    /** 未命中，已回落到 Other(value=-1)，需另行填写承运商名称 */
    fallbackToOther?: boolean;
    text?: string;
  };
};

export type EtsyDomOrderFillData = {
  results: EtsyDomOrderFillItemResult[];
};

export type EtsyDomCarrierNamesFillPayload = {
  items: Array<{ orderNumber: string; carrierName: string }>;
};

export type EtsyDomCarrierNamesFillItemResult = {
  orderNumber: string;
  ok: boolean;
  reason?: string;
  readback?: string;
};

export type EtsyDomCarrierNamesFillData = {
  results: EtsyDomCarrierNamesFillItemResult[];
};

export type EtsyImagesFetchPayload = {
  urls: string[];
  timeoutMs?: number;
  concurrency?: number;
  /** 排查用：贯穿页面 / content / service worker 的链路标识，不参与业务逻辑 */
  trace?: string;
};

export type EtsyImageFetchFailure = {
  index: number;
  url: string;
  error: string;
};

export type EtsyImageFetchResult =
  | {
      success: true;
      index: number;
      url: string;
      base64: string;
    }
  | {
      success: false;
      index: number;
      url: string;
      error: string;
    };

export type EtsyImagesFetchData = {
  images: string[];
  results?: EtsyImageFetchResult[];
  failures?: EtsyImageFetchFailure[];
};
