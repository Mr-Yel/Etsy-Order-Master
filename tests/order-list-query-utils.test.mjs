import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildOrderListQueryParams,
  getOrderPageOffset,
  MAX_ORDER_SEARCH_IDS,
  normalizeOrderPage,
  normalizeOrderPageSize,
  ORDER_PAGE_SIZE_OPTIONS,
  parseOrderSearchInput,
} from "../lib/order-list-query-utils.mjs";

test("normalizes order page size to the allowed dropdown values", () => {
  assert.deepEqual(ORDER_PAGE_SIZE_OPTIONS, [10, 20, 50]);
  assert.equal(normalizeOrderPageSize(10), 10);
  assert.equal(normalizeOrderPageSize("50"), 50);
  assert.equal(normalizeOrderPageSize(100), 20);
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

test("parses comma and newline separated order numbers without changing input", () => {
  assert.deepEqual(
    parseOrderSearchInput(" 4077329782, 4077329783\r\n4077329784\n"),
    {
      values: ["4077329782", "4077329783", "4077329784"],
      exceedsLimit: false,
    }
  );
  assert.deepEqual(parseOrderSearchInput("4077329782，4077329783、4077329784"), {
    values: ["4077329782", "4077329783", "4077329784"],
    exceedsLimit: false,
  });
});

test("deduplicates order numbers and enforces the five order limit", () => {
  assert.deepEqual(parseOrderSearchInput("1,1\n2"), {
    values: ["1", "2"],
    exceedsLimit: false,
  });
  assert.equal(MAX_ORDER_SEARCH_IDS, 5);
  assert.deepEqual(parseOrderSearchInput("1,2,3,4,5"), {
    values: ["1", "2", "3", "4", "5"],
    exceedsLimit: false,
  });
  assert.deepEqual(parseOrderSearchInput("1,2,3,4,5,6"), {
    values: ["1", "2", "3", "4", "5", "6"],
    exceedsLimit: true,
  });
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
