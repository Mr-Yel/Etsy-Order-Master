import { browser } from "wxt/browser";

const KST_SYNCED_ORDER_IDS_STORAGE_KEY = "kstSyncedOrderIds";
const KST_SYNCED_ORDER_ID_META_STORAGE_KEY = "kstSyncedOrderIdMeta";

export type SyncedOrderIdSource =
  | "remote_duplicate_check"
  | "import_verified";

export type SyncedOrderIdMeta = {
  source: SyncedOrderIdSource;
  updatedAt: string;
};

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

export async function getSyncedOrderIdMetaMap(): Promise<
  Record<string, SyncedOrderIdMeta>
> {
  try {
    const result = await browser.storage.local.get(
      KST_SYNCED_ORDER_ID_META_STORAGE_KEY
    );
    const rawMeta = result[KST_SYNCED_ORDER_ID_META_STORAGE_KEY];
    if (!rawMeta || typeof rawMeta !== "object" || Array.isArray(rawMeta)) {
      return {};
    }

    const metaEntries = Object.entries(
      rawMeta as Record<string, Partial<SyncedOrderIdMeta> | undefined>
    );
    const nextMeta: Record<string, SyncedOrderIdMeta> = {};
    for (const [orderId, meta] of metaEntries) {
      const normalizedOrderId = String(orderId ?? "").trim();
      if (!normalizedOrderId) continue;

      if (
        meta?.source !== "remote_duplicate_check" &&
        meta?.source !== "import_verified"
      ) {
        continue;
      }

      nextMeta[normalizedOrderId] = {
        source: meta.source,
        updatedAt:
          typeof meta.updatedAt === "string" && meta.updatedAt.trim()
            ? meta.updatedAt
            : new Date(0).toISOString(),
      };
    }

    return nextMeta;
  } catch (error) {
    console.warn("[KST] Failed to read synced order ID metadata", error);
    return {};
  }
}

export async function rememberSyncedOrderIds(
  orderIds: Array<string | number>,
  source?: SyncedOrderIdSource
): Promise<void> {
  const nextOrderIds = normalizeOrderIds(orderIds);
  if (!nextOrderIds.length) return;

  try {
    const existingOrderIds = await getSyncedOrderIds();
    const existingMeta = await getSyncedOrderIdMetaMap();
    const mergedOrderIds = normalizeOrderIds([
      ...existingOrderIds,
      ...nextOrderIds,
    ]);
    const mergedMeta: Record<string, SyncedOrderIdMeta> = {};

    for (const orderId of mergedOrderIds) {
      if (existingMeta[orderId]) {
        mergedMeta[orderId] = existingMeta[orderId];
      }
    }

    if (source) {
      const updatedAt = new Date().toISOString();
      for (const orderId of nextOrderIds) {
        mergedMeta[orderId] = {
          source,
          updatedAt,
        };
      }
    }

    await browser.storage.local.set({
      [KST_SYNCED_ORDER_IDS_STORAGE_KEY]: mergedOrderIds,
      [KST_SYNCED_ORDER_ID_META_STORAGE_KEY]: mergedMeta,
    });
  } catch (error) {
    console.warn("[KST] Failed to update synced order ID cache", error);
  }
}
