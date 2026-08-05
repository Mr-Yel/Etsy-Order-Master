import { kstAuthenticatedRequest } from "@/lib/kst-request";

export type KstShopRow = {
  id?: number;
  shopId?: string | null;
  shopName?: string | null;
  platformType?: string | null;
  userId?: number | null;
};

export type KstShopListResponse = {
  code: number;
  msg: string;
  rows?: KstShopRow[];
  total?: number;
};

export const KST_SHOP_LIST_SHOP_PATH = "/system/shop/listShop";
export const KST_SHOP_LIST_API_KEY = "withPersonnel_stores_api_key";

export async function fetchKstShopListViaProxy(): Promise<KstShopListResponse> {
  const data = await kstAuthenticatedRequest<KstShopListResponse>({
    path: KST_SHOP_LIST_SHOP_PATH,
    method: "GET",
    headers: {
      "X-API-Key": KST_SHOP_LIST_API_KEY,
    },
  });

  if (data?.code !== 200) {
    const msg = data?.msg ?? "请求店铺列表失败";
    throw new Error(msg);
  }

  return data;
}
