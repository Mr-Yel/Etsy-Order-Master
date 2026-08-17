import { getRuntimeScopedMessageType } from "./runtime-identity";

export const ETSY_CONTENT_BRIDGE_MESSAGE_TYPE = getRuntimeScopedMessageType(
  "ETSY_CONTENT_BRIDGE_REQUEST"
);

export const ETSY_CONTENT_BRIDGE_ACTIONS = {
  contextGet: "context.get",
  ordersList: "orders.list",
  conversationImagesCollect: "conversation.images.collect",
  imagesZipDownload: "images.zip.download",
} as const;

export type EtsyContentBridgeAction =
  (typeof ETSY_CONTENT_BRIDGE_ACTIONS)[keyof typeof ETSY_CONTENT_BRIDGE_ACTIONS];

export type EtsyContentBridgeRequest<TPayload = unknown> = {
  type: typeof ETSY_CONTENT_BRIDGE_MESSAGE_TYPE;
  action: EtsyContentBridgeAction;
  payload: TPayload;
};

export type EtsyContentBridgeError = {
  code: string;
  message: string;
  details?: unknown;
};

export type EtsyContentBridgeSuccessResponse<TData = unknown> = {
  success: true;
  data: TData;
};

export type EtsyContentBridgeErrorResponse = {
  success: false;
  error: EtsyContentBridgeError;
};

export type EtsyContentBridgeResponse<TData = unknown> =
  | EtsyContentBridgeSuccessResponse<TData>
  | EtsyContentBridgeErrorResponse;

export type EtsyContentOrdersListPayload = {
  shopId: number;
  requestedCount: number;
  baseParams: Record<string, string>;
  credentials?: RequestCredentials;
};

export type EtsyConversationImagesCollectData = {
  urls: string[];
  orderNumber: string;
};

export type EtsyImagesZipDownloadPayload = {
  urls: string[];
  orderNumber: string;
};

export type EtsyImagesZipDownloadData = {
  zipBase64: string;
  filename: string;
};
