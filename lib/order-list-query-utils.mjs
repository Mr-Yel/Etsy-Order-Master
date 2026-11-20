/**
 * 可选页大小。
 * 100 已确认不被 Etsy 订单列表接口接受（服务端会回退到默认页大小），
 * 因此这里只保留 10 / 20 / 50，与接口实际能力对齐。
 */
export const ORDER_PAGE_SIZE_OPTIONS = [10, 20, 50];
export const MAX_ORDER_SEARCH_IDS = 5;

export function normalizeOrderPageSize(value, fallback = 20) {
  const pageSize = Number(value);
  return ORDER_PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : fallback;
}

export function normalizeOrderPage(value) {
  const page = Number(value);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.floor(page);
}

export function getOrderPageOffset(page, pageSize) {
  return (normalizeOrderPage(page) - 1) * normalizeOrderPageSize(pageSize);
}

/**
 * 解析订单号搜索框。保留用户原始输入，仅在发起搜索时拆分、去重。
 * 支持换行、英文逗号、中文逗号和中文顿号。
 */
export function parseOrderSearchInput(value) {
  const normalized = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[，、]/g, ",");
  const values = [];

  for (const part of normalized.split(/[,\n]+/)) {
    const orderId = part.trim();
    if (orderId && !values.includes(orderId)) {
      values.push(orderId);
    }
  }

  return {
    values,
    exceedsLimit: values.length > MAX_ORDER_SEARCH_IDS,
  };
}

export function buildOrderListQueryParams(baseParams, query) {
  const pageSize = normalizeOrderPageSize(query.pageSize);
  const searchTerms = String(query.searchTerms ?? "").trim();
  const params = {
    ...baseParams,
    search_terms: searchTerms,
    limit: String(pageSize),
    offset: String(getOrderPageOffset(query.page, pageSize)),
  };

  if (
    query.omitOrderState === true ||
    (query.omitOrderStateOnSearch === true && searchTerms.length > 0)
  ) {
    delete params["filters[order_state_id]"];
  }

  return params;
}
