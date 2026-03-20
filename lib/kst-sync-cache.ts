import { browser } from "wxt/browser";

const KST_SYNCED_ORDER_IDS_STORAGE_KEY = "kstSyncedOrderIds";

function normalizeOrderIds(
  orderIds: Array<string | number | null | undefined>
): string[] {
  const normalizedIds = orderIds
    .map((orderId) => String(orderId ?? "").trim())
    .filter((orderId) => orderId.length > 0);

  return Array.from(new Set(normalizedIds));
}

export async function getSyncedOrderIds(): Promise<string[]> {
  try {
    const result = await browser.storage.local.get(
      KST_SYNCED_ORDER_IDS_STORAGE_KEY
    );
    const storedOrderIds = Array.isArray(
      result[KST_SYNCED_ORDER_IDS_STORAGE_KEY]
    )
      ? (result[KST_SYNCED_ORDER_IDS_STORAGE_KEY] as Array<
          string | number | null | undefined
        >)
      : [];

    return normalizeOrderIds(storedOrderIds);
  } catch (error) {
    console.warn("[KST] Failed to read synced order ID cache", error);
    return [];
  }
}

export async function getSyncedOrderIdSet(): Promise<Set<string>> {
  return new Set(await getSyncedOrderIds());
}

export async function rememberSyncedOrderIds(
  orderIds: Array<string | number>
): Promise<void> {
  const nextOrderIds = normalizeOrderIds(orderIds);
  if (!nextOrderIds.length) return;

  try {
    const existingOrderIds = await getSyncedOrderIds();
    const mergedOrderIds = normalizeOrderIds([
      ...existingOrderIds,
      ...nextOrderIds,
    ]);

    await browser.storage.local.set({
      [KST_SYNCED_ORDER_IDS_STORAGE_KEY]: mergedOrderIds,
    });
  } catch (error) {
    console.warn("[KST] Failed to update synced order ID cache", error);
  }
}
