import { browser } from "wxt/browser";

const KST_SYNCED_ORDER_IDS_STORAGE_KEY = "kstSyncedOrderIds";
const KST_SYNCED_ORDER_ID_META_STORAGE_KEY = "kstSyncedOrderIdMeta";
const KST_SYNC_CACHE_FORMAT_VERSION = 2;
const EPOCH_ISO_TIMESTAMP = new Date(0).toISOString();
const MAX_SYNCED_ORDER_CACHE_ENTRIES = 20_000;

export type SyncedOrderIdSource =
  | "remote_duplicate_check"
  | "import_verified";

const SYNCED_ORDER_ID_TTL_MS: Record<SyncedOrderIdSource, number> = {
  remote_duplicate_check: 7 * 24 * 60 * 60 * 1000,
  import_verified: 45 * 24 * 60 * 60 * 1000,
};

export type SyncedOrderIdMeta = {
  source: SyncedOrderIdSource;
  updatedAt: string;
};

export type SyncedOrderIdsCachePayload = {
  version: number;
  updatedAt: string;
  items: string[];
};

export type SyncedOrderIdMetaCachePayload = {
  version: number;
  updatedAt: string;
  items: Record<string, SyncedOrderIdMeta>;
};

type PrunedSyncedOrderCache = {
  orderIds: string[];
  metaMap: Record<string, SyncedOrderIdMeta>;
  removedExpiredCount: number;
  removedInconsistentCount: number;
  removedOverflowCount: number;
};

function normalizeOrderIds(
  orderIds: Array<string | number | null | undefined>
): string[] {
  const normalizedIds = orderIds
    .map((orderId) => String(orderId ?? "").trim())
    .filter((orderId) => orderId.length > 0);

  return Array.from(new Set(normalizedIds));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeIsoTimestamp(
  value: unknown,
  fallback = EPOCH_ISO_TIMESTAMP
): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function getTimestampMs(value: string): number {
  const timestampMs = Date.parse(value);
  return Number.isFinite(timestampMs) ? timestampMs : 0;
}

function getSyncedOrderIdTtlMs(source: SyncedOrderIdSource): number {
  return SYNCED_ORDER_ID_TTL_MS[source];
}

function hasCacheStateChanged(
  prevOrderIds: string[],
  prevMetaMap: Record<string, SyncedOrderIdMeta>,
  nextOrderIds: string[],
  nextMetaMap: Record<string, SyncedOrderIdMeta>
): boolean {
  if (prevOrderIds.length !== nextOrderIds.length) {
    return true;
  }

  for (let i = 0; i < prevOrderIds.length; i += 1) {
    if (prevOrderIds[i] !== nextOrderIds[i]) {
      return true;
    }
  }

  const prevEntries = Object.entries(prevMetaMap);
  const nextEntries = Object.entries(nextMetaMap);
  if (prevEntries.length !== nextEntries.length) {
    return true;
  }

  for (const [orderId, nextMeta] of nextEntries) {
    const prevMeta = prevMetaMap[orderId];
    if (
      !prevMeta ||
      prevMeta.source !== nextMeta.source ||
      prevMeta.updatedAt !== nextMeta.updatedAt
    ) {
      return true;
    }
  }

  return false;
}

function buildPrunedSyncedOrderCache(
  orderIds: string[],
  metaMap: Record<string, SyncedOrderIdMeta>,
  nowMs = Date.now()
): PrunedSyncedOrderCache {
  const normalizedOrderIds = normalizeOrderIds(orderIds);
  const orderIdSet = new Set(normalizedOrderIds);
  const keptRecords: Array<{ orderId: string; meta: SyncedOrderIdMeta }> = [];
  let removedExpiredCount = 0;
  let removedInconsistentCount = 0;

  for (const [orderId, meta] of Object.entries(metaMap)) {
    if (!orderIdSet.has(orderId)) {
      removedInconsistentCount += 1;
      continue;
    }

    const updatedAtMs = getTimestampMs(meta.updatedAt);
    const ttlMs = getSyncedOrderIdTtlMs(meta.source);
    if (updatedAtMs + ttlMs <= nowMs) {
      removedExpiredCount += 1;
      continue;
    }

    keptRecords.push({ orderId, meta });
  }

  for (const orderId of normalizedOrderIds) {
    if (!metaMap[orderId]) {
      removedInconsistentCount += 1;
    }
  }

  keptRecords.sort((left, right) => {
    const updatedAtDiff =
      getTimestampMs(right.meta.updatedAt) - getTimestampMs(left.meta.updatedAt);
    if (updatedAtDiff !== 0) {
      return updatedAtDiff;
    }

    return left.orderId.localeCompare(right.orderId);
  });

  let removedOverflowCount = 0;
  if (keptRecords.length > MAX_SYNCED_ORDER_CACHE_ENTRIES) {
    removedOverflowCount =
      keptRecords.length - MAX_SYNCED_ORDER_CACHE_ENTRIES;
    keptRecords.length = MAX_SYNCED_ORDER_CACHE_ENTRIES;
  }

  const nextOrderIds = keptRecords.map((record) => record.orderId);
  const nextMetaMap = Object.fromEntries(
    keptRecords.map((record) => [record.orderId, record.meta])
  );

  return {
    orderIds: nextOrderIds,
    metaMap: nextMetaMap,
    removedExpiredCount,
    removedInconsistentCount,
    removedOverflowCount,
  };
}

async function persistSyncedOrderCache(
  orderIds: string[],
  metaMap: Record<string, SyncedOrderIdMeta>,
  updatedAt = new Date().toISOString()
): Promise<void> {
  await browser.storage.local.set({
    [KST_SYNCED_ORDER_IDS_STORAGE_KEY]: {
      version: KST_SYNC_CACHE_FORMAT_VERSION,
      updatedAt,
      items: orderIds,
    } satisfies SyncedOrderIdsCachePayload,
    [KST_SYNCED_ORDER_ID_META_STORAGE_KEY]: {
      version: KST_SYNC_CACHE_FORMAT_VERSION,
      updatedAt,
      items: metaMap,
    } satisfies SyncedOrderIdMetaCachePayload,
  });
}

function normalizeSyncedOrderIdMetaMap(
  rawMeta: unknown
): Record<string, SyncedOrderIdMeta> {
  if (!isPlainObject(rawMeta)) {
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
      updatedAt: normalizeIsoTimestamp(meta.updatedAt),
    };
  }

  return nextMeta;
}

async function getSyncedOrderIdsCachePayload(): Promise<SyncedOrderIdsCachePayload> {
  const result = await browser.storage.local.get(KST_SYNCED_ORDER_IDS_STORAGE_KEY);
  const rawValue = result[KST_SYNCED_ORDER_IDS_STORAGE_KEY];

  if (Array.isArray(rawValue)) {
    return {
      version: 1,
      updatedAt: EPOCH_ISO_TIMESTAMP,
      items: normalizeOrderIds(rawValue),
    };
  }

  if (!isPlainObject(rawValue)) {
    return {
      version: KST_SYNC_CACHE_FORMAT_VERSION,
      updatedAt: EPOCH_ISO_TIMESTAMP,
      items: [],
    };
  }

  return {
    version:
      typeof rawValue.version === "number"
        ? rawValue.version
        : KST_SYNC_CACHE_FORMAT_VERSION,
    updatedAt: normalizeIsoTimestamp(rawValue.updatedAt),
    items: Array.isArray(rawValue.items) ? normalizeOrderIds(rawValue.items) : [],
  };
}

async function getSyncedOrderIdMetaCachePayload(): Promise<SyncedOrderIdMetaCachePayload> {
  const result = await browser.storage.local.get(
    KST_SYNCED_ORDER_ID_META_STORAGE_KEY
  );
  const rawValue = result[KST_SYNCED_ORDER_ID_META_STORAGE_KEY];

  if (!isPlainObject(rawValue)) {
    return {
      version: KST_SYNC_CACHE_FORMAT_VERSION,
      updatedAt: EPOCH_ISO_TIMESTAMP,
      items: {},
    };
  }

  if (isPlainObject(rawValue.items)) {
    return {
      version:
        typeof rawValue.version === "number"
          ? rawValue.version
          : KST_SYNC_CACHE_FORMAT_VERSION,
      updatedAt: normalizeIsoTimestamp(rawValue.updatedAt),
      items: normalizeSyncedOrderIdMetaMap(rawValue.items),
    };
  }

  return {
    version: 1,
    updatedAt: EPOCH_ISO_TIMESTAMP,
    items: normalizeSyncedOrderIdMetaMap(rawValue),
  };
}

export async function pruneSyncedOrderCache(): Promise<void> {
  try {
    const orderIdsPayload = await getSyncedOrderIdsCachePayload();
    const metaPayload = await getSyncedOrderIdMetaCachePayload();

    const prunedCache = buildPrunedSyncedOrderCache(
      orderIdsPayload.items,
      metaPayload.items
    );

    if (
      !hasCacheStateChanged(
        orderIdsPayload.items,
        metaPayload.items,
        prunedCache.orderIds,
        prunedCache.metaMap
      )
    ) {
      return;
    }

    await persistSyncedOrderCache(
      prunedCache.orderIds,
      prunedCache.metaMap
    );
    console.log("[KST] Pruned synced order cache", {
      totalOrderIds: prunedCache.orderIds.length,
      removedExpiredCount: prunedCache.removedExpiredCount,
      removedInconsistentCount: prunedCache.removedInconsistentCount,
      removedOverflowCount: prunedCache.removedOverflowCount,
    });
  } catch (error) {
    console.warn("[KST] Failed to prune synced order ID cache", error);
  }
}

export async function getSyncedOrderIds(): Promise<string[]> {
  try {
    return (await getSyncedOrderIdsCachePayload()).items;
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
    return (await getSyncedOrderIdMetaCachePayload()).items;
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
    const existingOrderIdsPayload = await getSyncedOrderIdsCachePayload();
    const existingMetaPayload = await getSyncedOrderIdMetaCachePayload();
    const prunedExistingCache = buildPrunedSyncedOrderCache(
      existingOrderIdsPayload.items,
      existingMetaPayload.items
    );
    const existingOrderIds = prunedExistingCache.orderIds;
    const existingMeta = prunedExistingCache.metaMap;
    const mergedOrderIds = normalizeOrderIds([
      ...existingOrderIds,
      ...nextOrderIds,
    ]);
    const mergedMeta: Record<string, SyncedOrderIdMeta> = {
      ...existingMeta,
    };

    if (source) {
      const updatedAt = new Date().toISOString();
      for (const orderId of nextOrderIds) {
        mergedMeta[orderId] = {
          source,
          updatedAt,
        };
      }
    }

    const prunedMergedCache = buildPrunedSyncedOrderCache(
      mergedOrderIds,
      mergedMeta
    );

    await persistSyncedOrderCache(
      prunedMergedCache.orderIds,
      prunedMergedCache.metaMap
    );

    if (
      prunedExistingCache.removedExpiredCount > 0 ||
      prunedExistingCache.removedInconsistentCount > 0 ||
      prunedExistingCache.removedOverflowCount > 0 ||
      prunedMergedCache.removedOverflowCount > 0
    ) {
      console.log("[KST] Compacted synced order cache while writing", {
        totalOrderIds: prunedMergedCache.orderIds.length,
        removedExpiredCount:
          prunedExistingCache.removedExpiredCount,
        removedInconsistentCount:
          prunedExistingCache.removedInconsistentCount,
        removedOverflowCount:
          prunedExistingCache.removedOverflowCount +
          prunedMergedCache.removedOverflowCount,
      });
    }
  } catch (error) {
    console.warn("[KST] Failed to update synced order ID cache", error);
  }
}
