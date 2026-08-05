import * as XLSX from "xlsx";
import { fetchPlatformOrdersImportJsonViaProxy } from "@/api";
import { emitAppLog } from "@/lib/app-log";
import { getToken } from "@/lib/auth-manager";
import { resolveOwnerUserIdForShop } from "@/lib/kst-shop-owner";
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
const DUP_SYNC_TRACE_PREFIX = "[DUP-SYNC-TRACE]";
let syncInvocationCounter = 0;

function traceLog(event: string, details: Record<string, unknown>): void {
  const body = Object.entries(details)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${String(value).replace(/\s+/g, "_")}`)
    .join(" ");
  console.log(`${DUP_SYNC_TRACE_PREFIX} ${event}${body ? ` ${body}` : ""}`);
}

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

async function confirmImportedOrderIds(
  orderIds: string[],
  traceId: string
): Promise<string[]> {
  let pendingOrderIds = Array.from(new Set(orderIds));
  const confirmedOrderIds = new Set<string>();

  for (const delayMs of IMPORT_CONFIRMATION_RETRY_DELAYS_MS) {
    if (!pendingOrderIds.length) break;
    if (delayMs > 0) {
      await wait(delayMs);
    }

    traceLog("kst.confirmImportedOrderIds.list-request", {
      traceId,
      delayMs,
      pendingOrderIdsCount: pendingOrderIds.length,
      pendingOrderIdsPreview: pendingOrderIds.slice(0, 10).join(","),
      reason: "post-import-confirmation",
    });
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
  const traceId = `${logContext?.requestId ?? logContext?.source ?? "sync"}#${++syncInvocationCounter}`;
  traceLog("kst.syncOrdersToKst.enter", {
    traceId,
    shopId,
    platformType,
    source: logContext?.source ?? "",
    requestId: logContext?.requestId ?? "",
    rowsCount: rows.length,
  });
  if (!rows.length) {
    getNotyf().error("请先选择要同步的订单");
    return;
  }

  const token = await getToken();
  if (!token) {
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
  traceLog("kst.syncOrdersToKst.order-ids", {
    traceId,
    allIdsCount: allIds.length,
    allIdsPreview: allIds.slice(0, 10).join(","),
  });
  if (!allIds.length) {
    getNotyf().error("选中订单中没有有效的 Order ID");
    return;
  }

  let ownerUserId: number | undefined;
  try {
    ownerUserId = await resolveOwnerUserIdForShop(shopId);
  } catch {
  }

  emitSyncLogs(
    allIds,
    "kst_sync_requested",
    {
      shopId,
      ownerUserId,
      platformType,
      totalSelectedRows: rows.length,
      logContext,
    },
    logContext?.source ?? "kst_sync"
  );

  let syncStatus: ResolvedOrderSyncStatus;
  try {
    traceLog("kst.syncOrdersToKst.pre-import-list-request", {
      traceId,
      reason: "pre-import-duplicate-check",
      allIdsCount: allIds.length,
      allIdsPreview: allIds.slice(0, 10).join(","),
    });
    syncStatus = await resolveOrderSyncStatus(allIds);
  } catch (error) {
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
    traceLog("kst.syncOrdersToKst.import-request", {
      traceId,
      shopId,
      ownerUserId,
      platformType,
      orderIdsToImportCount: orderIdsToImport.length,
      orderIdsToImportPreview: orderIdsToImport.slice(0, 10).join(","),
    });
    const res = await fetchPlatformOrdersImportJsonViaProxy({
      file,
      shopId: String(shopId),
      platformType,
      ownerUserId,
    });
    traceLog("kst.syncOrdersToKst.import-response", {
      traceId,
      code: res?.code,
      msg: res?.msg,
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
      confirmedOrderIds = await confirmImportedOrderIds(importedOrderIds, traceId);
    } catch (confirmError) {
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

    if (unconfirmedOrderIds.length > 0) {
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
