import { fetchKstShopListViaProxy, type KstShopRow } from "@/api/kst-shops";

type ShopOwnerMap = Map<string, number>;

let cachedShopOwnerMap: ShopOwnerMap | null = null;
let shopOwnerMapPromise: Promise<ShopOwnerMap> | null = null;

function normalizeShopId(shopId: number | string | null | undefined): string {
  return String(shopId ?? "").trim();
}

function buildShopOwnerMap(rows: KstShopRow[] | null | undefined): ShopOwnerMap {
  const map: ShopOwnerMap = new Map();

  (rows ?? []).forEach((row) => {
    const shopId = normalizeShopId(row.shopId);
    const ownerUserId = row.userId;
    if (!shopId || typeof ownerUserId !== "number" || !Number.isFinite(ownerUserId)) {
      return;
    }
    map.set(shopId, ownerUserId);
  });

  return map;
}

async function loadShopOwnerMap(): Promise<ShopOwnerMap> {
  if (cachedShopOwnerMap) {
    return cachedShopOwnerMap;
  }

  if (!shopOwnerMapPromise) {
    shopOwnerMapPromise = fetchKstShopListViaProxy()
      .then((response) => {
        const map = buildShopOwnerMap(response.rows);
        cachedShopOwnerMap = map;
        return map;
      })
      .catch((error) => {
        shopOwnerMapPromise = null;
        throw error;
      });
  }

  return shopOwnerMapPromise;
}

export async function resolveOwnerUserIdForShop(
  shopId: number | string
): Promise<number | undefined> {
  const normalizedShopId = normalizeShopId(shopId);
  if (!normalizedShopId) {
    return undefined;
  }

  const map = await loadShopOwnerMap();
  return map.get(normalizedShopId);
}

export function resetShopOwnerCache(): void {
  cachedShopOwnerMap = null;
  shopOwnerMapPromise = null;
}
