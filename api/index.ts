/** 统一导出 API，后续业务接口可在此追加 */
export { KST_BASE_URL } from "./constants";
export {
  getPublicKey,
  login,
  getInfo,
  type GetInfoUser,
} from "./kst-auth";
export {
  fetchPlatformOrdersList,
  fetchPlatformOrdersListViaProxy,
  PLATFORM_ORDERS_LIST_PATH,
  type PlatformOrdersListParams,
  type PlatformOrdersListResponse,
  type PlatformOrder,
  type PlatformOrderItem,
  type PlatformOrderItemProduct,
  type PlatformOrderPackage,
  type PlatformOrderShippingInfo,
} from "./kst-platform-orders";
