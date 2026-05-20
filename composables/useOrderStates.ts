import type { OrderState } from "@/lib/etsy-context";

/**
 * 将 Etsy 返回的 order_states 转为 name -> order_state_id 映射（用于 Popup 内下拉）
 */
export function convertOrderStatesToMap(
  orderStates: OrderState[] | null | undefined
): Record<string, number> {
  const map: Record<string, number> = {};
  if (orderStates && Array.isArray(orderStates)) {
    orderStates.forEach((state) => {
      if (state.name != null && state.order_state_id != null) {
        map[state.name] = state.order_state_id;
      }
    });
  }
  return map;
}

/**
 * 转为下拉选项 { label, value }[]（label 为状态名，value 为 order_state_id）
 */
export function orderStatesToOptions(
  orderStates: OrderState[] | null | undefined
): { label: string; value: number }[] {
  if (!orderStates?.length) return [];
  return orderStates
    .filter((s) => s.name != null && s.order_state_id != null)
    .map((s) => ({ label: s.name, value: s.order_state_id }));
}

/**
 * 取默认选中的 order_state_id，优先 preferredName（如 "New"），否则取第一个
 */
export function getDefaultOrderStateId(
  orderStates: OrderState[] | null | undefined,
  preferredName: string = "New"
): number | undefined {
  if (!orderStates?.length) return undefined;
  const preferred = orderStates.find(
    (s) => s.name?.toLowerCase() === preferredName.toLowerCase()
  );
  if (preferred?.order_state_id != null) return preferred.order_state_id;
  return orderStates[0]?.order_state_id;
}
