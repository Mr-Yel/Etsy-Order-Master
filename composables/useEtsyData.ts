/**
 * 通过 postMessage 与页面主世界通信，获取 Etsy 数据（shopId、orderStates）
 * 依赖 page-inject.js 已注入（content script 启动时已注入）
 */
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

export type EtsyDataResult = {
  success: boolean;
  shopId?: number;
  orderStates?: OrderState[];
  error?: string;
};

export function getEtsyData(): Promise<EtsyDataResult> {
  return new Promise((resolve, reject) => {
    const requestId = `etsy-data-${Date.now()}-${Math.random()}`;
    const timeout = setTimeout(() => {
      window.removeEventListener("message", handleResponse);
      reject(new Error("获取 Etsy 数据超时"));
    }, 5000);

    function handleResponse(event: MessageEvent) {
      if (event.source !== window) return;
      if (
        event.data?.type === "etsy-data-response" &&
        event.data.requestId === requestId
      ) {
        clearTimeout(timeout);
        window.removeEventListener("message", handleResponse);
        const { success, shopId, orderStates, error } = event.data;
        if (success && shopId !== undefined) {
          resolve({ success: true, shopId, orderStates });
        } else {
          resolve({ success: false, error: error || "无法获取 Etsy 数据" });
        }
      }
    }

    window.addEventListener("message", handleResponse);
    window.postMessage({ type: "get-etsy-data", requestId }, "*");
  });
}
