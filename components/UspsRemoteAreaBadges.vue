<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { fetchEtsyOrdersPage } from "@/api/etsy-orders";
import { getEtsyData } from "@/composables/useEtsyData";
import { getOrderListBaseParams } from "@/composables/useFetchOrderList";
import type { EtsyOrder } from "@/types/etsy-order";
import { getUspsRemotePostalPrefix } from "@/lib/usps-remote-area-utils.mjs";
import { getRuntimeScopedId } from "@/lib/runtime-identity";

const BADGE_CLASS = getRuntimeScopedId("eom-usps-remote-badge");
const ORDERS_SOLD_PATH = "/your/orders/sold";
const ORDER_LINK_SELECTOR = 'a[href*="order_id="], a[href*="/orders/"]';
const MAX_BATCH_SIZE = 50;

function isOrdersSoldPage(): boolean {
  return (
    window.location.pathname === ORDERS_SOLD_PATH ||
    window.location.pathname.startsWith(`${ORDERS_SOLD_PATH}/`)
  );
}

const postalCodeByOrderId = new Map<string, string>();
const missingOrderIds = new Set<string>();
let observer: MutationObserver | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshGeneration = 0;
let isRefreshing = false;
let refreshAgain = false;

function parseOrderIdFromLink(link: HTMLAnchorElement): string | null {
  try {
    const orderId = new URL(link.href, window.location.href).searchParams.get(
      "order_id"
    );
    if (orderId && /^\d+$/.test(orderId)) return orderId;
  } catch {
    // Fall through to the visible order number.
  }

  const match = (link.textContent ?? "").match(/#(\d{6,})/);
  return match?.[1] ?? null;
}

function getOrderLinks(root: ParentNode = document): HTMLAnchorElement[] {
  return Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href]"))
    .filter((link) => {
      if (link.matches(ORDER_LINK_SELECTOR)) return true;
      return /#\d{6,}/.test((link.textContent ?? "").trim());
    });
}

function getUniqueOrderIds(root: Element): Set<string> {
  const ids = new Set<string>();
  getOrderLinks(root).forEach((link) => {
    const orderId = parseOrderIdFromLink(link);
    if (orderId) ids.add(orderId);
  });
  return ids;
}

function findOrderCard(link: HTMLAnchorElement, orderId: string): HTMLElement | null {
  const semanticCard = link.closest<HTMLElement>(
    '[data-order-id], [data-receipt-id], article, li'
  );
  if (semanticCard && getUniqueOrderIds(semanticCard).size <= 1) {
    const rect = semanticCard.getBoundingClientRect();
    if (rect.width >= 320 && rect.height >= 90) return semanticCard;
  }

  let current: HTMLElement | null = link;
  let bestCandidate: HTMLElement | null = null;

  for (let depth = 0; current && depth < 12; depth += 1) {
    const ids = getUniqueOrderIds(current);
    if (ids.size > 1) break;

    const rect = current.getBoundingClientRect();
    if (
      ids.has(orderId) &&
      rect.width >= 320 &&
      rect.height >= 90 &&
      rect.height <= 900
    ) {
      bestCandidate = current;
    }

    current = current.parentElement;
  }

  return bestCandidate;
}

function collectVisibleOrderCards(): Map<string, HTMLElement> {
  const cards = new Map<string, HTMLElement>();
  getOrderLinks().forEach((link) => {
    const orderId = parseOrderIdFromLink(link);
    if (!orderId || cards.has(orderId)) return;
    const card = findOrderCard(link, orderId);
    if (card) cards.set(orderId, card);
  });
  return cards;
}

function removeStaleBadges(cards: Map<string, HTMLElement>): void {
  document.querySelectorAll<HTMLElement>(`.${BADGE_CLASS}`).forEach((badge) => {
    const orderId = badge.dataset.orderId;
    if (!orderId || cards.get(orderId) !== badge.parentElement) badge.remove();
  });
}

function renderBadge(card: HTMLElement, orderId: string, postalCode: string): void {
  if (card.querySelector(`.${BADGE_CLASS}`)) return;

  if (window.getComputedStyle(card).position === "static") {
    card.style.position = "relative";
  }

  const prefix = getUspsRemotePostalPrefix(postalCode);
  if (!prefix) return;

  const badge = document.createElement("div");
  badge.className = BADGE_CLASS;
  badge.dataset.orderId = orderId;
  badge.setAttribute("role", "note");
  badge.setAttribute(
    "aria-label",
    `USPS 偏远地区，邮编 ${postalCode}，公司内部附加费 5 美元每票`
  );
  badge.title = `邮编 ${postalCode}（${prefix} 开头）属于 USPS 偏远地区。公司内部附加费 $5/票，客户收费金额请按业务标准确认。`;
  const stopOrderCardNavigation = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  badge.addEventListener("pointerdown", stopOrderCardNavigation);
  badge.addEventListener("mousedown", stopOrderCardNavigation);
  badge.addEventListener("click", stopOrderCardNavigation);
  badge.innerHTML =
    '<span class="eom-usps-remote-badge__icon" aria-hidden="true">!</span>' +
    '<span class="eom-usps-remote-badge__text">USPS<br>偏远</span>';
  card.appendChild(badge);
}

function addOrdersToCache(orders: EtsyOrder[]): void {
  orders.forEach((order) => {
    const orderId = String(order.order_id);
    const postalCode = order.fulfillment?.to_address?.zip?.trim() ?? "";
    postalCodeByOrderId.set(orderId, postalCode);
    missingOrderIds.delete(orderId);
  });
}

function findCurrentOrderStateId(
  orderStates: Array<{ name: string; order_state_id: number }> | undefined
): string {
  const urlParams = new URLSearchParams(window.location.search);
  const fromUrl =
    urlParams.get("filters[order_state_id]") ??
    urlParams.get("order_state_id") ??
    urlParams.get("state_id");
  if (fromUrl && /^\d+$/.test(fromUrl)) return fromUrl;

  const activeTab = document.querySelector<HTMLElement>(
    'a[aria-current="page"], a[aria-selected="true"], [role="tab"][aria-selected="true"]'
  );
  const activeText = (activeTab?.textContent ?? "").replace(/\s+\d+\s*$/, "").trim();
  const matchedState = orderStates?.find(
    (state) => state.name.trim().toLowerCase() === activeText.toLowerCase()
  );
  return matchedState ? String(matchedState.order_state_id) : "";
}

function applyUrlFilters(params: Record<string, string>): void {
  const urlParams = new URLSearchParams(window.location.search);
  urlParams.forEach((value, key) => {
    if (key.startsWith("filters[") || key === "sort_by" || key === "sort_order") {
      params[key] = value;
    }
  });
}

async function fetchVisibleOrders(orderIds: string[]): Promise<void> {
  const etsy = await getEtsyData();
  if (!etsy.success || etsy.shopId == null) return;

  const stateId = findCurrentOrderStateId(etsy.orderStates);
  const baseParams = getOrderListBaseParams(stateId);
  if (!stateId) delete baseParams["filters[order_state_id]"];
  applyUrlFilters(baseParams);

  const page = Math.max(1, Number(new URLSearchParams(window.location.search).get("page")) || 1);
  const limit = Math.min(MAX_BATCH_SIZE, Math.max(orderIds.length, 20));
  try {
    const firstPage = await fetchEtsyOrdersPage(
      etsy.shopId,
      baseParams,
      limit,
      (page - 1) * limit,
      { credentials: "include" }
    );
    addOrdersToCache(firstPage.orders);
  } catch {
    // Continue with exact order-number searches when the page query is unavailable.
  }

  const unresolved = orderIds.filter((orderId) => !postalCodeByOrderId.has(orderId));
  for (let index = 0; index < unresolved.length; index += 4) {
    const group = unresolved.slice(index, index + 4);
    const results = await Promise.allSettled(
      group.map(async (orderId) => {
        const searchParams = getOrderListBaseParams("");
        delete searchParams["filters[order_state_id]"];
        searchParams.search_terms = orderId;
        return fetchEtsyOrdersPage(etsy.shopId!, searchParams, 1, 0, {
          credentials: "include",
        });
      })
    );

    results.forEach((result, resultIndex) => {
      if (result.status === "rejected") return;
      addOrdersToCache(result.value.orders);
      if (
        !result.value.orders.some(
          (order) => String(order.order_id) === group[resultIndex]
        )
      ) {
        missingOrderIds.add(group[resultIndex]);
      }
    });
  }
}

async function refreshBadges(): Promise<void> {
  if (!isOrdersSoldPage()) return;
  if (isRefreshing) {
    refreshAgain = true;
    return;
  }

  isRefreshing = true;
  const generation = ++refreshGeneration;
  try {
    const cards = collectVisibleOrderCards();
    removeStaleBadges(cards);
    const orderIds = Array.from(cards.keys());
    const uncachedIds = orderIds.filter(
      (orderId) => !postalCodeByOrderId.has(orderId) && !missingOrderIds.has(orderId)
    );

    if (uncachedIds.length > 0) await fetchVisibleOrders(uncachedIds);
    if (generation !== refreshGeneration) return;

    cards.forEach((card, orderId) => {
      const postalCode = postalCodeByOrderId.get(orderId);
      if (postalCode && getUspsRemotePostalPrefix(postalCode)) {
        renderBadge(card, orderId, postalCode);
      }
    });
  } catch (error) {
    console.warn("[Etsy Order Master] USPS 偏远地区提示加载失败", error);
  } finally {
    isRefreshing = false;
    if (refreshAgain) {
      refreshAgain = false;
      scheduleRefresh();
    }
  }
}

function scheduleRefresh(): void {
  if (refreshTimer != null) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void refreshBadges();
  }, 300);
}

onMounted(() => {
  scheduleRefresh();
  observer = new MutationObserver(scheduleRefresh);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("popstate", scheduleRefresh);
});

onUnmounted(() => {
  if (refreshTimer != null) clearTimeout(refreshTimer);
  observer?.disconnect();
  document.querySelectorAll(`.${BADGE_CLASS}`).forEach((badge) => badge.remove());
  window.removeEventListener("popstate", scheduleRefresh);
});
</script>

<template></template>

<style>
.eom-usps-remote-badge,
.eom-usps-remote-badge-test {
  position: absolute;
  right: 14px;
  bottom: 48px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 70px;
  min-height: 42px;
  padding: 6px 8px;
  box-sizing: border-box;
  color: #7c2d12;
  background: #fff7ed;
  border: 1px solid #fdba74;
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(124, 45, 18, 0.12);
  font-family: Arial, sans-serif;
  pointer-events: auto;
  cursor: help;
}

.eom-usps-remote-badge__icon {
  display: inline-flex;
  flex: 0 0 20px;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: #fff;
  background: #ea580c;
  border-radius: 50%;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
}

.eom-usps-remote-badge__text {
  font-size: 11px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: 0;
  white-space: nowrap;
}

.eom-usps-remote-badge-test {
  bottom: 96px;
  border-color: #f59e0b;
}

@media (max-width: 900px) {
  .eom-usps-remote-badge,
  .eom-usps-remote-badge-test {
    right: 8px;
    bottom: 42px;
  }

  .eom-usps-remote-badge-test {
    bottom: 86px;
  }
}
</style>
