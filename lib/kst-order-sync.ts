import * as XLSX from "xlsx";
import { fetchPlatformOrdersImportJsonViaProxy } from "@/api";
import { getToken } from "@/lib/auth-manager";
import {
  markOrderIdsAsSynced,
  type ResolvedOrderSyncStatus,
  resolveOrderSyncStatus,
} from "@/lib/kst-sync-status";
import { getNotyf } from "@/lib/notyf";
import type { ExportTableRow } from "@/utils/orders-mapping";

type SyncOrdersToKstParams = {
  shopId: number;
  rows: ExportTableRow[];
  platformType?: string;
};

const DEFAULT_PLATFORM_TYPE = "ETSY";

const collectOrderIds = (rows: ExportTableRow[]): string[] => {
  const ids = rows
    .map((row) => String(row["Order ID"] ?? "").trim())
    .filter((id) => id.length > 0);
  return Array.from(new Set(ids));
};

const buildOrdersExcelFile = (rows: ExportTableRow[]): File => {
  const ws = XLSX.utils.json_to_sheet(rows);
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
    throw error;
  }
  if (syncStatus.localDuplicateOrderIds.length > 0) {
    console.log("[KST] Skip orders already stored in local sync cache", {
      cachedOrderIds: syncStatus.localDuplicateOrderIds,
    });
  }
  if (syncStatus.remoteDuplicateOrderIds.length > 0) {
    console.log("[KST] Skip orders already found in remote KST records", {
      remoteDuplicateOrderIds: syncStatus.remoteDuplicateOrderIds,
    });
  }

  const orderIdsToSyncSet = new Set(syncStatus.orderIdsToSync);
  const rowsToSync = rows.filter((row) => {
    const id = String(row["Order ID"] ?? "").trim();
    return id && orderIdsToSyncSet.has(id);
  });

  if (!rowsToSync.length) {
    // Duplicate orders are skipped silently to avoid repeated sync and extra user noise.
    console.log("[KST] All selected orders were skipped by sync status check");
    return;
  }

  console.log("[KST] Orders that still need import", {
    totalRowsToSync: rowsToSync.length,
    orderIds: collectOrderIds(rowsToSync),
  });

  const file = buildOrdersExcelFile(rowsToSync);

  try {
    const res = await fetchPlatformOrdersImportJsonViaProxy({
      file,
      shopId: String(shopId),
      platformType,
    });

    const importedOrderIds = collectOrderIds(rowsToSync);
    await markOrderIdsAsSynced(importedOrderIds);

    console.log("[KST] Order import response", res);
    getNotyf().success(`已同步 ${rowsToSync.length} 条订单到 KST`);
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "同步到 KST 失败，请重试";
    console.error("[KST] Failed to import orders into KST", error);
    getNotyf().error(msg);
  }
};
