export const ETSY_BRIDGE_REQUEST_TYPE = "ETSY_BRIDGE_REQUEST" as const;
export const ETSY_BRIDGE_RESPONSE_TYPE = "ETSY_BRIDGE_RESPONSE" as const;
export const ETSY_BRIDGE_EVENT_TYPE = "ETSY_BRIDGE_EVENT" as const;

export const ETSY_BRIDGE_VERSION = 1 as const;

export const ETSY_BRIDGE_ACTIONS = {
  contextGet: "context.get",
  domSelectSet: "dom.select.set",
  domInputSet: "dom.input.set",
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

export type EtsyDomInputSetPayload = {
  selector: string;
  value: string;
  triggerEvents?: boolean;
};

export type EtsyImagesFetchPayload = {
  urls: string[];
};

export type EtsyImagesFetchData = {
  images: string[];
};
