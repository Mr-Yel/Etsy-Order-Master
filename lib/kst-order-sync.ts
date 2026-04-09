import * as XLSX from "xlsx";
import { fetchPlatformOrdersImportJsonViaProxy } from "@/api";
import { emitAppLog } from "@/lib/app-log";
import { getToken } from "@/lib/auth-manager";
import {
  findExistingRemoteOrderIds,
  markOrderIdsAsSynced,
  type ResolvedOrderSyncStatus,
  resolveOrderSyncStatus,
} from "@/lib/kst-sync-status";
import { getNotyf } from "@/lib/notyf";
import { EXPORT_COLUMNS, type ExportTableRow } from "@/utils/orders-mapping";

type SyncOrdersToKstParams = {
  shopId: number;
  rows: ExportTableRow[];
  platformType?: string;
  logContext?: {
    source?: string;
    requestId?: string;
    targetStateId?: number;
    targetStateName?: string;
    pageUrl?: string;
  };
};

const DEFAULT_PLATFORM_TYPE = "ETSY";
const IMPORT_CONFIRMATION_RETRY_DELAYS_MS = [0, 1500, 3000];

const collectOrderIds = (rows: ExportTableRow[]): string[] => {
  const ids = rows
    .map((row) => String(row["Order ID"] ?? "").trim())
    .filter((id) => id.length > 0);
  return Array.from(new Set(ids));
};

function emitSyncLogs(
  orderIds: Array<string | number>,
  event: string,
  details: Record<string, unknown>,
  source = "kst_sync"
): void {
  const occurredAt = new Date().toISOString();
  orderIds.forEach((orderId) => {
    void emitAppLog({
      event,
      orderNo: orderId,
      source,
      occurredAt,
      data: details,
    });
  });
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function confirmImportedOrderIds(orderIds: string[]): Promise<string[]> {
  let pendingOrderIds = Array.from(new Set(orderIds));
  const confirmedOrderIds = new Set<string>();

  for (const delayMs of IMPORT_CONFIRMATION_RETRY_DELAYS_MS) {
    if (!pendingOrderIds.length) break;
    if (delayMs > 0) {
      await wait(delayMs);
    }

    const existingOrderIds = await findExistingRemoteOrderIds(pendingOrderIds);
    existingOrderIds.forEach((orderId) => confirmedOrderIds.add(orderId));
    pendingOrderIds = pendingOrderIds.filter(
      (orderId) => !confirmedOrderIds.has(orderId)
    );
  }

  return Array.from(confirmedOrderIds);
}

const buildOrdersExcelFile = (rows: ExportTableRow[]): File => {
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...EXPORT_COLUMNS] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Orders");
  const arrayBuffer = XLSX.write(wb, {
    type: "array",
    bookType: "xlsx",
  });

  const now = new Date();
  const datePart = now.toISOString().slice(0, 10);
  const timePart = `${now.getHours().toString().padStart(2, "0")}${now
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
  const filename = `orders-kst-sync-${datePart}-${timePart}.xlsx`;

  return new File([arrayBuffer], filename, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
};

export const syncOrdersToKst = async ({
  shopId,
  rows,
  platformType = DEFAULT_PLATFORM_TYPE,
  logContext,
}: SyncOrdersToKstParams): Promise<void> => {
  if (!rows.length) {
    console.log("[KST] No selected orders, skip sync");
    getNotyf().error("请先选择要同步的订单");
    return;
  }

  const token = await getToken();
  if (!token) {
    console.warn("[KST] Missing KST token, cannot sync orders");
    getNotyf().error("请先登录 KST 账号后再同步订单");
    emitSyncLogs(
      collectOrderIds(rows),
      "kst_sync_skipped_not_logged_in",
      {
        shopId,
        platformType,
        logContext,
      },
      logContext?.source ?? "kst_sync"
    );
    return;
  }

  const allIds = collectOrderIds(rows);
  if (!allIds.length) {
    console.log("[KST] Selected rows do not contain valid Order ID values");
    getNotyf().error("选中订单中没有有效的 Order ID");
    return;
  }

  console.log("[KST] Preparing order sync", {
    shopId,
    platformType,
    totalSelectedRows: rows.length,
    uniqueOrderIds: allIds.length,
  });
  emitSyncLogs(
    allIds,
    "kst_sync_requested",
    {
      shopId,
      platformType,
      totalSelectedRows: rows.length,
      logContext,
    },
    logContext?.source ?? "kst_sync"
  );

  let syncStatus: ResolvedOrderSyncStatus;
  try {
    syncStatus = await resolveOrderSyncStatus(allIds);
  } catch (error) {
    console.error("[KST] Failed to resolve order sync status before import", {
      shopId,
      platformType,
      orderIdsPreview: allIds.slice(0, 10),
      error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    emitSyncLogs(
      allIds,
      "kst_sync_status_resolution_failed",
      {
        shopId,
        platformType,
        error:
          error instanceof Error
            ? {
                message: error.message,
                stack: error.stack ?? "",
              }
            : String(error),
        logContext,
      },
      logContext?.source ?? "kst_sync"
    );
    throw error;
  }
  if (syncStatus.localDuplicateOrderIds.length > 0) {
    console.log("[KST] Skip orders already stored in local sync cache", {
      cachedOrderIds: syncStatus.localDuplicateOrderIds,
    });
    emitSyncLogs(
      syncStatus.localDuplicateOrderIds,
      "kst_sync_skipped_local_duplicate",
      {
        shopId,
        platformType,
        duplicateSource: "local_cache",
        logContext,
      },
      logContext?.source ?? "kst_sync"
    );
  }
  if (syncStatus.remoteDuplicateOrderIds.length > 0) {
    console.log("[KST] Skip orders already found in remote KST records", {
      remoteDuplicateOrderIds: syncStatus.remoteDuplicateOrderIds,
    });
    emitSyncLogs(
      syncStatus.remoteDuplicateOrderIds,
      "kst_sync_skipped_remote_duplicate",
      {
        shopId,
        platformType,
        duplicateSource: "kst_remote",
        logContext,
      },
      logContext?.source ?? "kst_sync"
    );
  }

  const orderIdsToSyncSet = new Set(syncStatus.orderIdsToSync);
  const rowsToSync = rows.filter((row) => {
    const id = String(row["Order ID"] ?? "").trim();
    return id && orderIdsToSyncSet.has(id);
  });

  if (!rowsToSync.length) {
    // Duplicate orders are skipped silently to avoid repeated sync and extra user noise.
    console.log("[KST] All selected orders were skipped by sync status check");
    emitSyncLogs(
      allIds,
      "kst_sync_skipped_all_duplicates",
      {
        shopId,
        platformType,
        syncStatus,
        logContext,
      },
      logContext?.source ?? "kst_sync"
    );
    return;
  }

  console.log("[KST] Orders that still need import", {
    totalRowsToSync: rowsToSync.length,
    orderIds: collectOrderIds(rowsToSync),
  });
  const orderIdsToImport = collectOrderIds(rowsToSync);
  emitSyncLogs(
    orderIdsToImport,
    "kst_sync_import_started",
    {
      shopId,
      platformType,
      totalRowsToSync: rowsToSync.length,
      logContext,
    },
    logContext?.source ?? "kst_sync"
  );

  const file = buildOrdersExcelFile(rowsToSync);

  try {
    const res = await fetchPlatformOrdersImportJsonViaProxy({
      file,
      shopId: String(shopId),
      platformType,
    });

    const importedOrderIds = orderIdsToImport;
    emitSyncLogs(
      importedOrderIds,
      "kst_sync_import_response_received",
      {
        shopId,
        platformType,
        response: res,
        logContext,
      },
      logContext?.source ?? "kst_sync"
    );
    let confirmedOrderIds: string[];
    try {
      confirmedOrderIds = await confirmImportedOrderIds(importedOrderIds);
    } catch (confirmError) {
      console.error("[KST] Failed to confirm imported orders after import", {
        importedOrderIds,
        error: confirmError,
        errorMessage:
          confirmError instanceof Error
            ? confirmError.message
            : String(confirmError),
      });
      getNotyf().error(
        "导入请求已提交，但回查 KST 失败，未更新本地缓存，请稍后手动确认"
      );
      emitSyncLogs(
        importedOrderIds,
        "kst_sync_confirmation_failed",
        {
          shopId,
          platformType,
          response: res,
          error:
            confirmError instanceof Error
              ? {
                  message: confirmError.message,
                  stack: confirmError.stack ?? "",
                }
              : String(confirmError),
          logContext,
        },
        logContext?.source ?? "kst_sync"
      );
      return;
    }

    const confirmedOrderIdSet = new Set(confirmedOrderIds);
    const unconfirmedOrderIds = importedOrderIds.filter(
      (orderId) => !confirmedOrderIdSet.has(orderId)
    );

    if (confirmedOrderIds.length > 0) {
      await markOrderIdsAsSynced(confirmedOrderIds, "import_verified");
      emitSyncLogs(
        confirmedOrderIds,
        "kst_sync_verified_success",
        {
          shopId,
          platformType,
          response: res,
          logContext,
        },
        logContext?.source ?? "kst_sync"
      );
    }

    console.log("[KST] Order import response", res);
    console.log("[KST] Order import confirmation result", {
      importedOrderIds,
      confirmedOrderIds,
      unconfirmedOrderIds,
    });

    if (unconfirmedOrderIds.length > 0) {
      console.warn("[KST] Some imported orders were not confirmed remotely", {
        importedOrderIds,
        unconfirmedOrderIds,
      });
      emitSyncLogs(
        unconfirmedOrderIds,
        "kst_sync_unconfirmed_after_import",
        {
          shopId,
          platformType,
          response: res,
          logContext,
        },
        logContext?.source ?? "kst_sync"
      );
    }

    if (!confirmedOrderIds.length) {
      getNotyf().error(
        "导入请求已完成，但暂未在 KST 查到订单，未写入本地缓存"
      );
      return;
    }

    if (unconfirmedOrderIds.length > 0) {
      getNotyf().success(
        `已确认 ${confirmedOrderIds.length} 条订单进入 KST，另有 ${unconfirmedOrderIds.length} 条未确认，未写入缓存`
      );
      return;
    }

    getNotyf().success(`已确认同步 ${confirmedOrderIds.length} 条订单到 KST`);
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "同步到 KST 失败，请重试";
    console.error("[KST] Failed to import orders into KST", error);
    getNotyf().error(msg);
    emitSyncLogs(
      orderIdsToImport,
      "kst_sync_failed",
      {
        shopId,
        platformType,
        error:
          error instanceof Error
            ? {
                message: error.message,
                stack: error.stack ?? "",
              }
            : String(error),
        logContext,
      },
      logContext?.source ?? "kst_sync"
    );
  }
};
