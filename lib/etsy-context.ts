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
  const timeoutMs = options?.timeoutMs ?? 5000;

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

  inFlightPromise = new Promise<EtsyContextResult>((resolve) => {
    const requestId = `etsy-context-${Date.now()}-${Math.random()}`;

    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", handleResponse as any);
      const result: EtsyContextResult = {
        status: "error",
        context: null,
        error: "获取 Etsy 数据超时",
      };
      cachedResult = result;
      inFlightPromise = null;
      resolve(result);
    }, timeoutMs);

    const handleResponse = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as {
        type?: string;
        requestId?: string;
        success?: boolean;
        context?: RawEtsyContext;
        shopId?: number;
        orderStates?: OrderState[];
        error?: string;
      } | null;

      if (
        !data ||
        data.type !== "etsy-context:response" ||
        data.requestId !== requestId
      ) {
        return;
      }

      window.clearTimeout(timeout);
      window.removeEventListener("message", handleResponse as any);

      if (!data.success) {
        const result: EtsyContextResult = {
          status: "error",
          context: null,
          error: data.error || "无法获取 Etsy 数据",
        };
        cachedResult = result;
        inFlightPromise = null;
        resolve(result);
        return;
      }

      const context: EtsyContext = {
        raw: data.context ?? null,
        shopId: data.shopId,
        orderStates: data.orderStates,
      };

      const result: EtsyContextResult = {
        status: "ready",
        context,
      };
      cachedResult = result;
      inFlightPromise = null;
      resolve(result);
    };

    window.addEventListener("message", handleResponse as any);

    window.postMessage(
      {
        type: "etsy-context:get",
        requestId,
      },
      "*"
    );

    cachedResult = {
      status: "loading",
      context: null,
    };
  });

  return inFlightPromise;
}

