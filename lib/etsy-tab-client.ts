import type { EtsyContextGetData } from "./etsy-bridge-types";
import type { EtsyBuyer, EtsyOrder } from "@/types/etsy-order";
import {
  ETSY_CONTENT_BRIDGE_ACTIONS,
  ETSY_CONTENT_BRIDGE_MESSAGE_TYPE,
  type EtsyContentBridgeAction,
  type EtsyContentBridgeRequest,
  type EtsyContentBridgeResponse,
  type EtsyContentOrdersListPayload,
  type EtsyConversationImagesCollectData,
  type EtsyImagesZipDownloadData,
  type EtsyImagesZipDownloadPayload,
} from "./etsy-content-bridge-types";

async function getActiveTabId(): Promise<number> {
  const tabs = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tabs.length || !tabs[0].id) {
    throw new Error("未找到当前标签页");
  }

  return tabs[0].id;
}

async function sendEtsyRequestToActiveTab<TPayload, TData>(params: {
  action: EtsyContentBridgeAction;
  payload: TPayload;
}): Promise<TData> {
  const tabId = await getActiveTabId();
  const response = (await browser.tabs.sendMessage(tabId, {
    type: ETSY_CONTENT_BRIDGE_MESSAGE_TYPE,
    action: params.action,
    payload: params.payload,
  } satisfies EtsyContentBridgeRequest<TPayload>)) as
    | EtsyContentBridgeResponse<TData>
    | undefined;

  if (response?.success) {
    return response.data;
  }

  throw new Error(response?.error.message ?? "Etsy 请求失败");
}

export async function getEtsyContextFromActiveTab(): Promise<EtsyContextGetData> {
  return sendEtsyRequestToActiveTab<Record<string, never>, EtsyContextGetData>({
    action: ETSY_CONTENT_BRIDGE_ACTIONS.contextGet,
    payload: {},
  });
}

export async function fetchEtsyOrdersFromActiveTab(
  payload: EtsyContentOrdersListPayload
) {
  return sendEtsyRequestToActiveTab<
    EtsyContentOrdersListPayload,
    {
      orders: EtsyOrder[];
      buyers: EtsyBuyer[];
    }
  >({
    action: ETSY_CONTENT_BRIDGE_ACTIONS.ordersList,
    payload,
  });
}

export async function collectConversationImagesFromActiveTab(): Promise<EtsyConversationImagesCollectData> {
  return sendEtsyRequestToActiveTab<Record<string, never>, EtsyConversationImagesCollectData>({
    action: ETSY_CONTENT_BRIDGE_ACTIONS.conversationImagesCollect,
    payload: {},
  });
}

export async function downloadConversationImagesZipFromActiveTab(
  payload: EtsyImagesZipDownloadPayload
): Promise<EtsyImagesZipDownloadData> {
  return sendEtsyRequestToActiveTab<
    EtsyImagesZipDownloadPayload,
    EtsyImagesZipDownloadData
  >({
    action: ETSY_CONTENT_BRIDGE_ACTIONS.imagesZipDownload,
    payload,
  });
}
