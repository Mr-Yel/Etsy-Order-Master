import {
  type OrderState,
} from "@/lib/etsy-context";
import { getEtsyBridgeContext } from "@/lib/etsy-bridge-client";

export type { OrderState };

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
    const context = await getEtsyBridgeContext();
    if (context.shopId == null) {
      return {
        success: false,
        error: "无法获取 Etsy 数据",
      };
    }

    return {
      success: true,
      shopId: context.shopId,
      orderStates: context.orderStates as OrderState[] | undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "无法获取 Etsy 数据",
    };
  }
}
