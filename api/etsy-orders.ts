const BASE_URL = "https://www.etsy.com/api/v3/ajax/bespoke/shop";
const MAX_LIMIT_PER_REQUEST = 50;
import type {
  EtsyBuyer,
  EtsyOrder,
  EtsyOrdersSearchResponse,
} from "@/types/etsy-order";

export type EtsyOrderListBaseParams = Record<string, string>;

export type EtsyFetchOrderListOptions = {
  credentials?: RequestCredentials;
};

export type EtsyFetchOrderListResult = {
  orders: EtsyOrder[];
  buyers: EtsyBuyer[];
};

/**
 * Etsy 订单个性化附件。
 *
 * 接口：
 * GET https://www.etsy.com/api/v3/ajax/shop/{shop_id}/mission-control/orders/personalization-files/{order_id}
 *
 * 返回值是附件数组。`thumbnailUrl` 用于表格预览，下载原文件时使用 `url`。
 */
export type EtsyOrderPersonalizationFile = {
  /** Etsy 附件文件 ID */
  fileId: number;
  /** 附件关联的交易 ID */
  transactionId: number;
  /** 个性化问题 ID */
  questionId: number;
  /** 原图/原文件下载地址 */
  url: string;
  /** 缩略图地址，用于列表展示 */
  thumbnailUrl: string;
  /** 买家上传时的文件名 */
  filename: string;
  /** 文件 MIME 类型，例如 image/jpeg */
  mimeType: string;
  /** 文件大小，单位 byte */
  size: number;
  /** 选项 ID，接口可能返回 null */
  optionId: number | null;
  /** 附件标签，接口可能返回 null */
  label: string | null;
};

/**
 * Etsy 个性化附件接口原始返回字段，接口实际使用 snake_case。
 * 业务代码请使用归一化后的 `EtsyOrderPersonalizationFile`。
 */
export type EtsyOrderPersonalizationFileResponse = {
  /** Etsy 附件文件 ID */
  file_id: number;
  /** 附件关联的交易 ID */
  transaction_id: number;
  /** 个性化问题 ID */
  question_id: number;
  /** 原图/原文件下载地址 */
  url: string;
  /** 缩略图地址，用于列表展示 */
  thumbnail_url: string;
  /** 买家上传时的文件名 */
  filename: string;
  /** 文件 MIME 类型，例如 image/png */
  mime_type: string;
  /** 文件大小，单位 byte */
  size: number;
  /** 选项 ID，接口可能返回 null */
  option_id: number | null;
  /** 附件标签，接口可能返回 null */
  label: string | null;
};

export function buildEtsyOrderListBaseParams(
  stateId: string
): EtsyOrderListBaseParams {
  return {
    "filters[buyer_id]": "all",
    "filters[channel]": "all",
    "filters[completed_status]": "all",
    "filters[completed_date]": "all",
    "filters[destination]": "all",
    "filters[ship_date]": "all",
    "filters[shipping_label_eligibility]": "false",
    "filters[shipping_label_status]": "all",
    "filters[has_buyer_notes]": "false",
    "filters[is_marked_as_gift]": "false",
    "filters[is_personalized]": "false",
    "filters[has_shipping_upgrade]": "false",
    "filters[order_state_id]": stateId,
    search_terms: "",
    sort_by: "order_date",
    sort_order: "desc",
    "objects_enabled_for_normalization[order_state]": "true",
  };
}

export async function fetchEtsyOrdersPage(
  shopId: number,
  baseParams: EtsyOrderListBaseParams,
  limit: number,
  offset: number,
  options?: EtsyFetchOrderListOptions
): Promise<EtsyFetchOrderListResult> {
  const params: Record<string, string> = {
    ...baseParams,
    limit: String(limit),
    offset: String(offset),
  };
  const url = `${BASE_URL}/${shopId}/mission-control/orders/data?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    method: "GET",
    credentials: options?.credentials ?? "same-origin",
  });
  if (!res.ok) {
    throw new Error(`请求失败: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as EtsyOrdersSearchResponse;
  return {
    orders: data?.orders_search?.orders ?? [],
    buyers: data?.orders_search?.buyers ?? [],
  };
}

export async function fetchEtsyOrderList(
  shopId: number,
  requestedCount: number,
  baseParams: EtsyOrderListBaseParams,
  options?: EtsyFetchOrderListOptions
): Promise<EtsyFetchOrderListResult> {
  const allOrders: EtsyOrder[] = [];
  const buyersById = new Map<number, EtsyBuyer>();

  let offset = 0;
  let remaining = requestedCount;

  while (remaining > 0) {
    const limit = Math.min(remaining, MAX_LIMIT_PER_REQUEST);
    const { orders, buyers } = await fetchEtsyOrdersPage(
      shopId,
      baseParams,
      limit,
      offset,
      options
    );

    allOrders.push(...orders);

    for (const buyer of buyers) {
      const buyerId = buyer.buyer_id;
      if (buyerId != null && !buyersById.has(buyerId)) {
        buyersById.set(buyerId, buyer);
      }
    }

    if (orders.length < limit) break;

    offset += orders.length;
    remaining -= orders.length;
    if (allOrders.length >= requestedCount) break;
  }

  return {
    orders:
      allOrders.length > requestedCount
        ? allOrders.slice(0, requestedCount)
        : allOrders,
    buyers: Array.from(buyersById.values()),
  };
}

export async function fetchEtsyOrderPersonalizationFiles(
  shopId: number,
  orderId: number | string,
  options?: EtsyFetchOrderListOptions
): Promise<EtsyOrderPersonalizationFile[]> {
  const url = `https://www.etsy.com/api/v3/ajax/shop/${shopId}/mission-control/orders/personalization-files/${orderId}`;
  const res = await fetch(url, {
    method: "GET",
    credentials: options?.credentials ?? "same-origin",
  });

  if (!res.ok) {
    throw new Error(`请求订单附件失败: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return (data as EtsyOrderPersonalizationFileResponse[]).map((file) => ({
    fileId: file.file_id,
    transactionId: file.transaction_id,
    questionId: file.question_id,
    url: file.url,
    thumbnailUrl: file.thumbnail_url,
    filename: file.filename,
    mimeType: file.mime_type,
    size: file.size,
    optionId: file.option_id,
    label: file.label,
  }));
}
