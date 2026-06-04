/**
 * 扩展 import.meta.env 类型
 * VITE_EOM_DEV_TOKEN：开发环境下由 dev-token.txt 注入的本地免登录 token
 */
interface ImportMetaEnv {
  readonly VITE_EOM_DEV_TOKEN?: string;
  readonly VITE_EOM_APP_LOG_ENABLED?: string;
  readonly VITE_EOM_APP_LOG_BASE_URL?: string;
  readonly VITE_EOM_APP_LOG_CLIENT_ID?: string;
  readonly VITE_EOM_APP_LOG_CLIENT_SECRET?: string;
}

declare module "@/lib/kst-ship-by-date-sync-utils.mjs" {
  export function formatChinaDateTimeFromUnixSeconds(seconds: number): string;
  export function appendShipByDateLog(options: {
    errorInfo?: string | null;
    platformOrderId: string;
    latestDeliveryTime: string;
    now?: number;
    randomIdPart?: string;
  }): string;
}

declare module "@/lib/order-list-query-utils.mjs" {
  export const ORDER_PAGE_SIZE_OPTIONS: readonly [10, 20, 50, 100];
  export function normalizeOrderPageSize(
    value: unknown,
    fallback?: number
  ): number;
  export function normalizeOrderPage(value: unknown): number;
  export function getOrderPageOffset(page: unknown, pageSize: unknown): number;
  export function buildOrderListQueryParams(
    baseParams: Record<string, string>,
    query: {
      page: unknown;
      pageSize: unknown;
      searchTerms?: unknown;
      omitOrderState?: boolean;
      omitOrderStateOnSearch?: boolean;
    }
  ): Record<string, string>;
}
