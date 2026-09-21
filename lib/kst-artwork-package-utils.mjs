export function buildEtsyArtworkPackageOrdersJson(rows) {
  const orderIds = [];
  const itemsByOrderId = new Map();

  for (const row of rows ?? []) {
    const platformOrderId = String(row.orderId ?? "").trim();
    const sku = String(row.sku ?? "").trim();
    if (!platformOrderId || !sku) continue;

    let items = itemsByOrderId.get(platformOrderId);
    if (!items) {
      items = { skuOrder: [], counts: new Map() };
      itemsByOrderId.set(platformOrderId, items);
      orderIds.push(platformOrderId);
    }
    if (!items.counts.has(sku)) {
      items.skuOrder.push(sku);
      items.counts.set(sku, 0);
    }
    items.counts.set(sku, items.counts.get(sku) + 1);
  }

  return orderIds.map((platform_order_id) => {
    const items = itemsByOrderId.get(platform_order_id);
    return {
      platform_order_id,
      order_items: items.skuOrder.map((sku) => ({
        sku,
        quantity: items.counts.get(sku),
      })),
    };
  });
}
