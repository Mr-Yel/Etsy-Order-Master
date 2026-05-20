import { getEtsyBridgeContext } from "./etsy-bridge-client";

export type OrderState = {
  type: string;
  order_state_id: number;
  client_id: number | null;
  position: number;
  name: string;
  state_type: string;
  order_count: number | null;
  actions: string[];
};

export type RawEtsyContext = unknown;

export type EtsyContext = {
  raw: RawEtsyContext;
  shopId?: number;
  orderStates?: OrderState[];
};

export type EtsyContextStatus = "idle" | "loading" | "ready" | "error";

export type EtsyContextResult =
  | {
      status: "idle";
      context: null;
      error?: undefined;
    }
  | {
      status: "loading";
      context: null;
      error?: undefined;
    }
  | {
      status: "ready";
      context: EtsyContext;
      error?: undefined;
    }
  | {
      status: "error";
      context: null;
      error: string;
    };

let cachedResult: EtsyContextResult = {
  status: "idle",
  context: null,
};

let inFlightPromise: Promise<EtsyContextResult> | null = null;

export const getEtsyContextSnapshot = (): EtsyContextResult => cachedResult;

export function resetEtsyContextCache(): void {
  cachedResult = {
    status: "idle",
    context: null,
  };
  inFlightPromise = null;
}

export function ensureEtsyContextFromMainWorld(
  options?: { timeoutMs?: number }
): Promise<EtsyContextResult> {
  if (cachedResult.status === "ready" || cachedResult.status === "error") {
    return Promise.resolve(cachedResult);
  }

  if (inFlightPromise) {
    return inFlightPromise;
  }

  if (typeof window === "undefined") {
    const result: EtsyContextResult = {
      status: "error",
      context: null,
      error: "window 不可用，无法获取 Etsy 上下文",
    };
    cachedResult = result;
    return Promise.resolve(result);
  }

  cachedResult = {
    status: "loading",
    context: null,
  };

  inFlightPromise = (async () => {
    try {
      const data = await getEtsyBridgeContext({
        timeoutMs: options?.timeoutMs,
      });
      const context: EtsyContext = {
        raw: data.raw ?? null,
        shopId: data.shopId,
        orderStates: data.orderStates as OrderState[] | undefined,
      };
      const result: EtsyContextResult = {
        status: "ready",
        context,
      };
      cachedResult = result;
      return result;
    } catch (error) {
      const result: EtsyContextResult = {
        status: "error",
        context: null,
        error: error instanceof Error ? error.message : "无法获取 Etsy 数据",
      };
      cachedResult = result;
      return result;
    } finally {
      inFlightPromise = null;
    }
  })();

  return inFlightPromise;
}

