export const ORDER_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

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
