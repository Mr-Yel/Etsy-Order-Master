import {
  ETSY_BRIDGE_ACTIONS,
  ETSY_BRIDGE_REQUEST_TYPE,
  ETSY_BRIDGE_RESPONSE_TYPE,
  ETSY_BRIDGE_VERSION,
  type EtsyBridgeAction,
  type EtsyBridgeRequest,
  type EtsyBridgeResponse,
  type EtsyBridgeSource,
} from "./etsy-bridge-types";

function createRequestId(action: EtsyBridgeAction): string {
  const actionToken = action.replace(/[^\w.-]/g, "_");
  return `etsy-bridge-${actionToken}-${Date.now()}-${Math.random()}`;
}

export async function sendEtsyMainworldBridgeRequest<TPayload, TResponse>(params: {
  action: EtsyBridgeAction;
  payload: TPayload;
  source?: EtsyBridgeSource;
  timeoutMs?: number;
}): Promise<TResponse> {
  if (typeof window === "undefined") {
    throw new Error("window 不可用，无法请求 Etsy 主世界桥接");
  }

  const requestId = createRequestId(params.action);
  const timeoutMs = params.timeoutMs ?? 5000;

  const request: EtsyBridgeRequest<TPayload> = {
    type: ETSY_BRIDGE_REQUEST_TYPE,
    requestId,
    action: params.action,
    payload: params.payload,
    meta: {
      source: params.source ?? "content",
      version: ETSY_BRIDGE_VERSION,
      timestamp: Date.now(),
      timeoutMs,
    },
  };

  return new Promise<TResponse>((resolve, reject) => {
    const handleResponse = (event: MessageEvent) => {
      if (event.source !== window) return;

      const data = event.data as EtsyBridgeResponse<TResponse> | null;
      if (
        !data ||
        data.type !== ETSY_BRIDGE_RESPONSE_TYPE ||
        data.requestId !== requestId
      ) {
        return;
      }

      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handleResponse as EventListener);

      if (data.success) {
        resolve(data.data);
        return;
      }

      reject(new Error(data.error.message));
    };

    const timeoutId = window.setTimeout(() => {
      window.removeEventListener("message", handleResponse as EventListener);
      reject(new Error(`Etsy bridge 请求超时: ${params.action}`));
    }, timeoutMs);

    window.addEventListener("message", handleResponse as EventListener);
    window.postMessage(request, "*");
  });
}

export async function getEtsyContextViaBridge() {
  return sendEtsyMainworldBridgeRequest<
    Record<string, never>,
    {
      raw: unknown;
      shopId?: number;
      orderStates?: Array<{
        type: string;
        order_state_id: number;
        client_id: number | null;
        position: number;
        name: string;
        state_type: string;
        order_count: number | null;
        actions: string[];
      }>;
    }
  >({
    action: ETSY_BRIDGE_ACTIONS.contextGet,
    payload: {},
  });
}
