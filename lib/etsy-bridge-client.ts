import {
  ETSY_BRIDGE_ACTIONS,
  type EtsyBridgeOrderState,
  type EtsyContextGetData,
  type EtsyDomInputSetPayload,
  type EtsyDomSelectSetPayload,
  type EtsyImagesFetchData,
  type EtsyImagesFetchPayload,
} from "./etsy-bridge-types";
import { sendEtsyMainworldBridgeRequest } from "./etsy-mainworld-client";

export async function getEtsyBridgeContext(options?: {
  timeoutMs?: number;
}): Promise<EtsyContextGetData> {
  return sendEtsyMainworldBridgeRequest<Record<string, never>, EtsyContextGetData>({
    action: ETSY_BRIDGE_ACTIONS.contextGet,
    payload: {},
    timeoutMs: options?.timeoutMs,
  });
}

export async function setEtsySelectOption(
  payload: EtsyDomSelectSetPayload
): Promise<{ success: true; value?: string }> {
  return sendEtsyMainworldBridgeRequest<
    EtsyDomSelectSetPayload,
    { success: true; value?: string }
  >({
    action: ETSY_BRIDGE_ACTIONS.domSelectSet,
    payload,
  });
}

export async function setEtsyInputValue(
  payload: EtsyDomInputSetPayload
): Promise<{ success: true }> {
  return sendEtsyMainworldBridgeRequest<EtsyDomInputSetPayload, { success: true }>({
    action: ETSY_BRIDGE_ACTIONS.domInputSet,
    payload,
  });
}

export async function fetchEtsyImagesAsBase64(
  payload: EtsyImagesFetchPayload
): Promise<EtsyImagesFetchData> {
  return sendEtsyMainworldBridgeRequest<EtsyImagesFetchPayload, EtsyImagesFetchData>({
    action: ETSY_BRIDGE_ACTIONS.imagesFetchAsBase64,
    payload,
    timeoutMs: 60000,
  });
}

export type { EtsyBridgeOrderState };
