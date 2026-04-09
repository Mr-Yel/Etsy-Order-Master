import { fetchPlatformOrdersListViaProxy } from "@/api";
import {
  getSyncedOrderIdSet,
  pruneSyncedOrderCache,
  rememberSyncedOrderIds,
  type SyncedOrderIdSource,
} from "@/lib/kst-sync-cache";

const MAX_IDS_PER_REQUEST = 80;

export type ResolvedOrderSyncStatus = {
  orderIdsToSync: string[];
  duplicateOrderIds: string[];
  localDuplicateOrderIds: string[];
  remoteDuplicateOrderIds: string[];
};

export class OrderSyncStatusResolutionError extends Error {
  readonly code: "remote_duplicate_check_failed";
  readonly orderIds: string[];

  constructor(message: string, orderIds: string[]) {
    super(message);
    this.name = "OrderSyncStatusResolutionError";
    this.code = "remote_duplicate_check_failed";
    this.orderIds = orderIds;
  }
}

function normalizeOrderIds(
  orderIds: Array<string | number | null | undefined>
): string[] {
  return Array.from(
    new Set(
      orderIds
        .map((orderId) => String(orderId ?? "").trim())
        .filter((orderId) => orderId.length > 0)
    )
  );
}

function splitIntoBatches<T>(items: T[], batchSize: number): T[][] {
  if (!items.length) return [];

  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

export async function findExistingRemoteOrderIds(
  orderIds: Array<string | number | null | undefined>
): Promise<string[]> {
  const normalizedOrderIds = normalizeOrderIds(orderIds);
  if (!normalizedOrderIds.length) return [];

  const remoteDuplicateIds = new Set<string>();
  const batches = splitIntoBatches(normalizedOrderIds, MAX_IDS_PER_REQUEST);

  for (const batch of batches) {
    const platformOrderIds = batch.join(",");
    try {
      const response = await fetchPlatformOrdersListViaProxy({
        pageNum: 1,
        pageSize: batch.length,
        platformOrderIds,
      });

      response.rows.forEach((order) => {
        const orderId = String(order.platformOrderId ?? "").trim();
        if (orderId) {
          remoteDuplicateIds.add(orderId);
        }
      });
    } catch (error) {
      console.error("[KST] Failed to verify remote duplicate orders", {
        batchOrderIds: batch,
        totalCandidates: normalizedOrderIds.length,
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw new OrderSyncStatusResolutionError(
        "校验 KST 已同步订单失败，请重试",
        batch
      );
    }
  }

  return Array.from(remoteDuplicateIds);
}

export async function resolveOrderSyncStatus(
  orderIds: Array<string | number | null | undefined>
): Promise<ResolvedOrderSyncStatus> {
  const normalizedOrderIds = normalizeOrderIds(orderIds);
  if (!normalizedOrderIds.length) {
    return {
      orderIdsToSync: [],
      duplicateOrderIds: [],
      localDuplicateOrderIds: [],
      remoteDuplicateOrderIds: [],
    };
  }

  await pruneSyncedOrderCache();
  const syncedOrderIdSet = await getSyncedOrderIdSet();
  const localDuplicateOrderIds = normalizedOrderIds.filter((orderId) =>
    syncedOrderIdSet.has(orderId)
  );
  const orderIdsMissingFromLocal = normalizedOrderIds.filter(
    (orderId) => !syncedOrderIdSet.has(orderId)
  );

  const remoteDuplicateOrderIds = await findExistingRemoteOrderIds(
    orderIdsMissingFromLocal
  );
  if (remoteDuplicateOrderIds.length) {
    // Backfill local cache so future checks can short-circuit without remote IO.
    await rememberSyncedOrderIds(
      remoteDuplicateOrderIds,
      "remote_duplicate_check"
    );
  }

  const duplicateOrderIdSet = new Set<string>([
    ...localDuplicateOrderIds,
    ...remoteDuplicateOrderIds,
  ]);

  return {
    orderIdsToSync: normalizedOrderIds.filter(
      (orderId) => !duplicateOrderIdSet.has(orderId)
    ),
    duplicateOrderIds: Array.from(duplicateOrderIdSet),
    localDuplicateOrderIds,
    remoteDuplicateOrderIds,
  };
}

export async function markOrderIdsAsSynced(
  orderIds: Array<string | number>,
  source: SyncedOrderIdSource = "import_verified"
): Promise<void> {
  await rememberSyncedOrderIds(orderIds, source);
}
