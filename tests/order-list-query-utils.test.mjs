import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildOrderListQueryParams,
  getOrderPageOffset,
  normalizeOrderPage,
  normalizeOrderPageSize,
  ORDER_PAGE_SIZE_OPTIONS,
} from "../lib/order-list-query-utils.mjs";

test("normalizes order page size to the allowed dropdown values", () => {
  assert.deepEqual(ORDER_PAGE_SIZE_OPTIONS, [10, 20, 50, 100]);
  assert.equal(normalizeOrderPageSize(10), 10);
  assert.equal(normalizeOrderPageSize("50"), 50);
  assert.equal(normalizeOrderPageSize(999), 20);
  assert.equal(normalizeOrderPageSize("bad"), 20);
});

test("normalizes order page and calculates offset", () => {
  assert.equal(normalizeOrderPage(3), 3);
  assert.equal(normalizeOrderPage("4"), 4);
  assert.equal(normalizeOrderPage(0), 1);
  assert.equal(normalizeOrderPage("bad"), 1);
  assert.equal(getOrderPageOffset(3, 20), 40);
});

test("builds Etsy order list params with limit, offset, and trimmed search terms", () => {
  const params = buildOrderListQueryParams(
    {
      "filters[order_state_id]": "123",
      search_terms: "",
      sort_by: "order_date",
    },
    {
      page: 2,
      pageSize: 50,
      searchTerms: " 4077329782 ",
    }
  );

  assert.deepEqual(params, {
    "filters[order_state_id]": "123",
    search_terms: "4077329782",
    sort_by: "order_date",
    limit: "50",
    offset: "50",
  });
});

test("omits order state filter when searching by order number", () => {
  const params = buildOrderListQueryParams(
    {
      "filters[order_state_id]": "123",
      search_terms: "",
      sort_by: "order_date",
    },
    {
      page: 1,
      pageSize: 20,
      searchTerms: "4077329782",
      omitOrderStateOnSearch: true,
    }
  );

  assert.equal(params.search_terms, "4077329782");
  assert.equal(params.limit, "20");
  assert.equal(params.offset, "0");
  assert.equal(Object.hasOwn(params, "filters[order_state_id]"), false);
});

test("omits order state filter when state is manually cleared", () => {
  const params = buildOrderListQueryParams(
    {
      "filters[order_state_id]": "",
      search_terms: "",
      sort_by: "order_date",
    },
    {
      page: 1,
      pageSize: 20,
      searchTerms: "",
      omitOrderState: true,
    }
  );

  assert.equal(params.search_terms, "");
  assert.equal(Object.hasOwn(params, "filters[order_state_id]"), false);
});
