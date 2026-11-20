/**
 * 收集行中的不同 Order ID，保持首次出现顺序，供合并同步/导出使用。
 */
export function collectOrderIdsForMerge(rows, orderIdKey = "Order ID") {
  const orderIds = [];

  for (const row of rows ?? []) {
    const orderId = String(row?.[orderIdKey] ?? "").trim();
    if (orderId && !orderIds.includes(orderId)) {
      orderIds.push(orderId);
    }
  }

  return orderIds;
}

/**
 * 复制选中行并只把 Order ID 改成用 / 拼接后的合并 ID。
 * 行数、顺序和其他字段保持不变，也不修改传入的原始行。
 */
export function mergeOrderRowsForExport(rows, orderIdKey = "Order ID") {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const mergedOrderId = collectOrderIdsForMerge(sourceRows, orderIdKey).join("/");

  return sourceRows.map((row) => ({
    ...row,
    [orderIdKey]: mergedOrderId,
  }));
}
