import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEtsyArtworkPackageOrdersJson } from "../lib/kst-artwork-package-utils.mjs";

test("groups selected rows into ordersJson without goods_name", () => {
  const ordersJson = buildEtsyArtworkPackageOrdersJson([
    { orderId: 4162852667, sku: "ABC-001" },
    { orderId: "4162852667", sku: " ABC-001 " },
    { orderId: 4163399912, sku: "DEF-002" },
    { orderId: 4163399912, sku: "" },
    { orderId: "", sku: "SKIP" },
  ]);

  assert.deepEqual(ordersJson, [
    {
      platform_order_id: "4162852667",
      order_items: [{ sku: "ABC-001", quantity: 2 }],
    },
    {
      platform_order_id: "4163399912",
      order_items: [{ sku: "DEF-002", quantity: 1 }],
    },
  ]);
  assert.equal(
    JSON.stringify(ordersJson).includes("goods_name"),
    false
  );
});

test("returns an empty list when no valid rows exist", () => {
  assert.deepEqual(buildEtsyArtworkPackageOrdersJson([]), []);
  assert.deepEqual(buildEtsyArtworkPackageOrdersJson(undefined), []);
});
