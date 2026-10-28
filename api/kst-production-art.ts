import { kstAuthenticatedRequest } from "@/lib/kst-request";

/** 作图需求来源系统，当前只接入 Etsy */
export type ProductionArtSourceSystem = "ETSY";

/** 单个商品的期望图片数 */
export type ProductionArtExpectedImageCountItem = {
  /**
   * 商品在订单内的序号，从 1 开始，
   * 与订单详情 `orderItems` 的顺序一致（对应导出弹窗里的「第 N 项」）。
   */
  itemIndex: number;
  /** 该商品期望生成的图片张数 */
  expectedImageCount: number;
};

/** 单笔订单的期望图片数配置 */
export type ProductionArtExpectedImageCountOrder = {
  /** 平台订单号，如 Etsy 的 `order_id` */
  platformOrderId: string;
  /** 订单备注，会带到作图需求里；无备注可不传 */
  remark?: string;
  /** 该订单下各商品的期望图片数，一次可传多个商品 */
  items: ProductionArtExpectedImageCountItem[];
};

/** 上报期望图片数请求体 */
export type ProductionArtExpectedImageCountsParams = {
  /** 来源系统，Etsy 场景固定传 "ETSY" */
  sourceSystem: ProductionArtSourceSystem;
  /** 店铺编码，Etsy 场景取当前店铺 ID（字符串形式） */
  shopCode: string;
  /** 订单列表，支持一次上报多个订单 */
  orders: ProductionArtExpectedImageCountOrder[];
};

/** 上报期望图片数接口响应 */
export type ProductionArtExpectedImageCountsResponse = {
  code: number;
  msg: string;
  data?: unknown;
};

/** 上报期望图片数接口 path */
export const PRODUCTION_ART_EXPECTED_IMAGE_COUNTS_PATH =
  "/order/production-art/expected-image-counts";

/** 代理层「后台未响应」的错误特征：MV3 service worker 被回收时首条消息可能丢失 */
const PROXY_NO_RESPONSE_HINT = "KST 代理未返回有效结果";

/**
 * 通过 background 代理上报订单商品的期望图片数
 *
 * POST /order/production-art/expected-image-counts
 * 用于「下载总 ZIP」导出完成后，把每个订单商品的作图张数同步给 KST 作图侧。
 * token 由统一请求层自动注入，401 由 proxy 层统一处理。
 *
 * 该接口按订单商品覆盖写入，重试不会产生重复数据；
 * 因此遇到「后台未响应」时重试一次，规避 service worker 刚被回收导致的丢消息。
 */
export async function submitProductionArtExpectedImageCountsViaProxy(
  params: ProductionArtExpectedImageCountsParams
): Promise<ProductionArtExpectedImageCountsResponse> {
  const send = () =>
    kstAuthenticatedRequest<ProductionArtExpectedImageCountsResponse>({
      path: PRODUCTION_ART_EXPECTED_IMAGE_COUNTS_PATH,
      method: "POST",
      body: params,
    });

  let data: ProductionArtExpectedImageCountsResponse;
  try {
    data = await send();
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes(PROXY_NO_RESPONSE_HINT)
    ) {
      throw error;
    }
    console.warn("[生产图数量] 代理未响应，重试一次", {
      path: PRODUCTION_ART_EXPECTED_IMAGE_COUNTS_PATH,
    });
    data = await send();
  }

  if (data?.code !== 200) {
    const msg = data?.msg ?? "上报期望图片数失败";
    throw new Error(msg);
  }
  return data;
}
