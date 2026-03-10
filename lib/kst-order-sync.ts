import * as XLSX from "xlsx";
import type { ExportTableRow } from "@/utils/orders-mapping";
import {
  fetchPlatformOrdersListViaProxy,
  fetchPlatformOrdersImportJsonViaProxy,
  type PlatformOrdersListResponse,
} from "@/api";
import { getToken } from "@/lib/auth-manager";

type SyncOrdersToKstParams = {
  shopId: number;
  rows: ExportTableRow[];
  platformType?: string;
};

const DEFAULT_PLATFORM_TYPE = "ETSY";
const MAX_IDS_PER_REQUEST = 80;

const collectOrderIds = (rows: ExportTableRow[]): string[] => {
  const ids = rows
    .map((row) => String(row["Order ID"] ?? "").trim())
    .filter((id) => id.length > 0);
  return Array.from(new Set(ids));
};

const splitIntoBatches = <T>(items: T[], batchSize: number): T[][] => {
  if (items.length === 0) return [];
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
};

const findExistingPlatformOrderIds = async (
  allPlatformOrderIds: string[],
  token: string
): Promise<Set<string>> => {
  const existingIds = new Set<string>();
  const batches = splitIntoBatches(allPlatformOrderIds, MAX_IDS_PER_REQUEST);

  for (const batch of batches) {
    if (!batch.length) continue;
    const platformOrderIds = batch.join(",");
    try {
      const res: PlatformOrdersListResponse = await fetchPlatformOrdersListViaProxy(
        {
          pageNum: 1,
          pageSize: batch.length,
          platformOrderIds,
        },
        token
      );
      res.rows.forEach((order) => {
        const id = (order.platformOrderId ?? "").trim();
        if (id) {
          existingIds.add(id);
        }
      });
    } catch (error) {
      console.warn("[KST] 查询已同步订单失败，将跳过本次批次", {
        error,
        platformOrderIds,
      });
    }
  }

  return existingIds;
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
    console.log("[KST] 无选中订单，跳过同步");
    return;
  }

  const token = await getToken();
  if (!token) {
    console.warn("[KST] 未获取到 KST token，无法同步订单");
    return;
  }

  const allIds = collectOrderIds(rows);
  if (!allIds.length) {
    console.log("[KST] 选中订单中没有有效的 Order ID，跳过同步");
    return;
  }

  console.log("[KST] 准备同步订单到 KST", {
    shopId,
    platformType,
    totalSelectedRows: rows.length,
    uniqueOrderIds: allIds.length,
  });

  const existingIds = await findExistingPlatformOrderIds(allIds, token);
  if (existingIds.size > 0) {
    console.log("[KST] 检测到已同步订单，将跳过这些订单", {
      existingIds: Array.from(existingIds),
    });
  }

  const rowsToSync = rows.filter((row) => {
    const id = String(row["Order ID"] ?? "").trim();
    return id && !existingIds.has(id);
  });

  if (!rowsToSync.length) {
    console.log("[KST] 所选订单均已在 KST 中存在，未执行导入");
    return;
  }

  console.log("[KST] 需要导入到 KST 的订单", {
    total: rowsToSync.length,
  });

  const file = buildOrdersExcelFile(rowsToSync);

  try {
    const res = await fetchPlatformOrdersImportJsonViaProxy(
      {
        file,
        shopId: String(shopId),
        platformType,
      },
      token
    );
    console.log("[KST] 订单导入接口返回", res);
  } catch (error) {
    console.error("[KST] 导入订单到 KST 失败", error);
  }
};

