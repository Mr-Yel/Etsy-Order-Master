/**
 * 订单列表请求（单次接口最多 50 条）
 * 外部传入目标个数，内部按页循环请求，返回合并后的 orders 与 buyers
 */

const BASE_URL = "https://www.etsy.com/api/v3/ajax/bespoke/shop";
const MAX_LIMIT_PER_REQUEST = 50;

export type OrderListBaseParams = Record<string, string>;

export type FetchOrderListOptions = {
  credentials?: RequestCredentials;
};

export type FetchOrderListResult = {
  orders: Array<Record<string, unknown>>;
  buyers: Array<Record<string, unknown>>;
};

/**
 * 请求一页订单列表（limit 建议 ≤ 50）
 */
async function fetchOrdersPage(
  shopId: number,
  baseParams: OrderListBaseParams,
  limit: number,
  offset: number,
  options?: FetchOrderListOptions
): Promise<{ orders: Array<Record<string, unknown>>; buyers: Array<Record<string, unknown>> }> {
  const params: Record<string, string> = {
    ...baseParams,
    limit: String(limit),
    offset: String(offset),
  };
  const url = `${BASE_URL}/${shopId}/mission-control/orders/data?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    method: "GET",
    credentials: options?.credentials ?? "same-origin",
  });
  if (!res.ok) {
    throw new Error(`请求失败: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const orders = (data?.orders_search?.orders ?? []) as Array<Record<string, unknown>>;
  const buyers = (data?.orders_search?.buyers ?? []) as Array<Record<string, unknown>>;
  return { orders, buyers };
}

/**
 * 按目标个数拉取订单列表；单次最多 50 条，内部循环分页直到拿满或没有更多数据
 * @param shopId 店铺 ID
 * @param requestedCount 希望获取的条数
 * @param baseParams 除 limit、offset 外的查询参数（filters、sort 等）
 * @param options 可选，如 credentials: "include"
 */
export async function fetchOrderList(
  shopId: number,
  requestedCount: number,
  baseParams: OrderListBaseParams,
  options?: FetchOrderListOptions
): Promise<FetchOrderListResult> {
  const allOrders: Array<Record<string, unknown>> = [];
  const buyersById = new Map<number, Record<string, unknown>>();

  let offset = 0;
  let remaining = requestedCount;

  while (remaining > 0) {
    const limit = Math.min(remaining, MAX_LIMIT_PER_REQUEST);
    const { orders, buyers } = await fetchOrdersPage(
      shopId,
      baseParams,
      limit,
      offset,
      options
    );

    allOrders.push(...orders);

    for (const b of buyers) {
      const id = b.buyer_id as number | undefined;
      if (id != null && !buyersById.has(id)) {
        buyersById.set(id, b);
      }
    }

    if (orders.length < limit) break;

    offset += orders.length;
    remaining -= orders.length;
    if (allOrders.length >= requestedCount) break;
  }

  const finalOrders =
    allOrders.length > requestedCount ? allOrders.slice(0, requestedCount) : allOrders;
  const buyersList = Array.from(buyersById.values());

  return { orders: finalOrders, buyers: buyersList };
}
