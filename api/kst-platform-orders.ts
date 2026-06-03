import { kstAuthenticatedRequest } from "@/lib/kst-request";
import { KST_BASE_URL } from "./constants";

/** 平台订单列表请求参数（三个入参） */
export type PlatformOrdersListParams = {
  pageNum: number;
  pageSize: number;
  /** 平台订单 ID，多个用英文逗号分隔 */
  platformOrderIds: string;
};

/** 订单项下的商品（SKU 维度） */
export type PlatformOrderItemProduct = {
  id?: number;
  orderItemId?: number;
  productId?: number;
  skuId?: string | null;
  sku?: string | null;
  title?: string | null;
  mainImage?: string | null;
  quantity?: number;
  currency?: string | null;
  itemPrice?: number | null;
  platformSpecificDetailsJson?: string | null;
  localProductId?: string | null;
  mappingStatus?: string | null;
  mappedVariantAttribute?: string | null;
  systemSkc?: string | null;
  productionImageUrl?: string | null;
  productionImageUrlBackup?: string | null;
  packageLength?: number | null;
  packageWidth?: number | null;
  packageHeight?: number | null;
  packageWeight?: number | null;
  dimensionUnit?: string | null;
  weightUnit?: string | null;
  supplierSpu?: string | null;
  supplierSku?: string | null;
  supplierName?: string | null;
  createTime?: string | null;
  updateTime?: string | null;
};

/** 平台订单项（行项目） */
export type PlatformOrderItem = {
  id?: number;
  platformOrderId?: string | null;
  platformOrderItemId?: string | null;
  quantity?: number;
  sku?: string | null;
  goodsName?: string | null;
  thumbUrl?: string | null;
  itemStatus?: string | null;
  platformSpecificDetailsJson?: string | null;
  orderItemProducts?: PlatformOrderItemProduct[] | null;
  createTime?: string | null;
  updateTime?: string | null;
};

/** 包裹信息 */
export type PlatformOrderPackage = {
  id?: number;
  platformOrderId?: string | null;
  packageSn?: string | null;
  trackingNumber?: string | null;
  shippingLabelUrl?: string | null;
  status?: string | null;
  shippingCompanyName?: string | null;
  warehouseId?: string | null;
  warehouseName?: string | null;
  shippingCompanyId?: string | null;
  channelId?: string | null;
  estimatedAmount?: number | null;
  estimatedTime?: string | null;
};

/** 收货地址信息 */
export type PlatformOrderShippingInfo = {
  id?: number;
  platformOrderId?: string | null;
  recipientName?: string | null;
  mobile?: string | null;
  email?: string | null;
  postCode?: string | null;
  regionName1?: string | null;
  regionName2?: string | null;
  regionName3?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  addressLineAll?: string | null;
};

/** 平台订单（列表行） */
export type PlatformOrder = {
  id?: string | null;
  childId?: string | null;
  platformType?: string | null;
  shopId?: string | null;
  shop?: string | null;
  platformOrderId?: string | null;
  platformOrderStatus?: string | null;
  orderTime?: string | null;
  platformUpdateTime?: string | null;
  shippingTime?: string | null;
  latestDeliveryTime?: string | null;
  expectShipLatestTime?: string | null;
  orderPaymentType?: string | null;
  orderStatus?: string | null;
  importType?: number | null;
  platformSpecificDetailsJson?: string | null;
  errorInfo?: string | null;
  createTime?: string | null;
  updateTime?: string | null;
  orderItems?: PlatformOrderItem[] | null;
  packages?: PlatformOrderPackage[] | null;
  shippingInfo?: PlatformOrderShippingInfo | null;
  orderUpdateTime?: number | null;
  orderCreateTime?: number | null;
};

/** 平台订单列表接口响应 */
export type PlatformOrdersListResponse = {
  total: number;
  rows: PlatformOrder[];
  code: number;
  msg: string;
};

export type PlatformOrderDetailResponse = {
  code: number;
  msg: string;
  data?: PlatformOrder | null;
};

export type PlatformOrderUpdateParams = {
  id: string;
  latestDeliveryTime: string;
  errorInfo: string;
};

export type PlatformOrderUpdateResponse = {
  code: number;
  msg: string;
  [key: string]: unknown;
};

const PLATFORM_ORDERS_BASE = KST_BASE_URL;

/**
 * 调用 KST 平台订单列表接口
 * @param params 分页与平台订单 ID 列表
 * @param token Bearer 认证 token
 */
export async function fetchPlatformOrdersList(
  params: PlatformOrdersListParams,
  token: string
): Promise<PlatformOrdersListResponse> {
  const search = new URLSearchParams({
    pageNum: String(params.pageNum),
    pageSize: String(params.pageSize),
    platformOrderIds: params.platformOrderIds,
  });
  const url = `${PLATFORM_ORDERS_BASE}/system/platform-orders/list?${search}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json, text/plain, */*",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
  });
  const data = (await res.json()) as PlatformOrdersListResponse;
  if (data?.code !== 200) {
    const msg = data?.msg ?? `请求失败: ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data;
}

/** 平台订单列表接口 path，供代理与文档统一 */
export const PLATFORM_ORDERS_LIST_PATH = "/system/platform-orders/list";

/**
 * 通过 background 代理调用 KST 平台订单列表接口（用于 content script 等易触发 CORS 的环境）
 * token 由统一请求层自动注入，401 时由 proxy 层统一处理
 */
export async function fetchPlatformOrdersListViaProxy(
  params: PlatformOrdersListParams
): Promise<PlatformOrdersListResponse> {
  const data = await kstAuthenticatedRequest<PlatformOrdersListResponse>({
    path: PLATFORM_ORDERS_LIST_PATH,
    method: "GET",
    query: {
      pageNum: String(params.pageNum),
      pageSize: String(params.pageSize),
      platformOrderIds: params.platformOrderIds,
    },
  });
  if (data?.code !== 200) {
    const msg = data?.msg ?? "请求失败";
    throw new Error(msg);
  }
  return data;
}

export function platformOrderDetailPath(id: string): string {
  return `/system/platform-orders/${encodeURIComponent(id)}`;
}

export async function fetchPlatformOrderDetailViaProxy(
  id: string
): Promise<PlatformOrderDetailResponse> {
  const data = await kstAuthenticatedRequest<PlatformOrderDetailResponse>({
    path: platformOrderDetailPath(id),
    method: "GET",
  });
  if (data?.code !== 200) {
    const msg = data?.msg ?? "请求失败";
    throw new Error(msg);
  }
  return data;
}

export async function updatePlatformOrderShipByDateViaProxy(
  params: PlatformOrderUpdateParams
): Promise<PlatformOrderUpdateResponse> {
  const data = await kstAuthenticatedRequest<PlatformOrderUpdateResponse>({
    path: platformOrderDetailPath(params.id),
    method: "PUT",
    body: {
      latestDeliveryTime: params.latestDeliveryTime,
      errorInfo: params.errorInfo,
    },
  });
  if (data?.code !== 200) {
    const msg = data?.msg ?? "请求失败";
    throw new Error(msg);
  }
  return data;
}

/** 平台订单导入 JSON/Excel 请求参数 */
export type PlatformOrdersImportJsonParams = {
  file: File;
  shopId: string;
  platformType: string;
};

/** 平台订单导入接口响应（与列表接口一致：code、msg） */
export type PlatformOrdersImportJsonResponse = {
  code: number;
  msg: string;
  [key: string]: unknown;
};

/** 平台订单导入接口 path */
export const PLATFORM_ORDERS_IMPORT_JSON_PATH = "/system/platform-orders/import-json";

/**
 * 直接调用 KST 平台订单导入接口（multipart/form-data：file、shopId、platformType）
 * 仅在无 CORS 限制的环境使用（如 background / 同源页）
 */
export async function fetchPlatformOrdersImportJson(
  params: PlatformOrdersImportJsonParams,
  token: string
): Promise<PlatformOrdersImportJsonResponse> {
  const formData = new FormData();
  formData.append("file", params.file, params.file.name);
  formData.append("shopId", params.shopId);
  formData.append("platformType", params.platformType);

  const url = `${PLATFORM_ORDERS_BASE}${PLATFORM_ORDERS_IMPORT_JSON_PATH}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json, text/plain, */*",
      Authorization: `Bearer ${token}`,
    },
    body: formData,
    credentials: "include",
  });
  const data = (await res.json()) as PlatformOrdersImportJsonResponse;
  if (data?.code !== 200) {
    const msg = data?.msg ?? `请求失败: ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data;
}

/** 将 File 转为 base64 字符串 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(",") ? result.slice(result.indexOf(",") + 1) : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * 通过 background 代理调用 KST 平台订单导入接口（用于 content script 等易触发 CORS 的环境）
 * token 由统一请求层自动注入，401 时由 proxy 层统一处理
 */
export async function fetchPlatformOrdersImportJsonViaProxy(
  params: PlatformOrdersImportJsonParams
): Promise<PlatformOrdersImportJsonResponse> {
  const base64 = await fileToBase64(params.file);
  const data = await kstAuthenticatedRequest<PlatformOrdersImportJsonResponse>({
    path: PLATFORM_ORDERS_IMPORT_JSON_PATH,
    method: "POST",
    formFile: {
      base64,
      fileName: params.file.name,
      mimeType: params.file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
    formFields: {
      shopId: params.shopId,
      platformType: params.platformType,
    },
  });
  if (data?.code !== 200) {
    const msg = data?.msg ?? "请求失败";
    throw new Error(msg);
  }
  return data;
}
