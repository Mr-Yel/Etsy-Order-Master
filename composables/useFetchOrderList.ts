/**
 * Etsy 订单列表请求兼容层。
 * 第一阶段先把公共请求逻辑收敛到 api/etsy-orders.ts，
 * 现有调用方仍从 composable 入口使用，避免一次改动过大。
 */
export {
  buildEtsyOrderListBaseParams as getOrderListBaseParams,
  fetchEtsyOrderList as fetchOrderList,
  type EtsyFetchOrderListOptions as FetchOrderListOptions,
  type EtsyFetchOrderListResult as FetchOrderListResult,
  type EtsyOrderListBaseParams as OrderListBaseParams,
} from "@/api/etsy-orders";
