import {
  type OrderState,
  ensureEtsyContextFromMainWorld,
} from "@/lib/etsy-context";

/**
 * 通过统一的 EtsyContext 服务从页面主世界获取 Etsy 数据
 * 保持原有返回结构（shopId、orderStates、error），方便现有调用方复用
 */

export type EtsyDataResult = {
  success: boolean;
  shopId?: number;
  orderStates?: OrderState[];
  error?: string;
};

export async function getEtsyData(): Promise<EtsyDataResult> {
  try {
    const result = await ensureEtsyContextFromMainWorld();
    if (result.status !== "ready" || !result.context) {
      return {
        success: false,
        error: result.error || "无法获取 Etsy 数据",
      };
    }

    const { shopId, orderStates } = result.context;
    if (shopId == null) {
      return {
        success: false,
        error: "无法获取店铺 ID",
      };
    }

    return {
      success: true,
      shopId,
      orderStates,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "无法获取 Etsy 数据",
    };
  }
}
