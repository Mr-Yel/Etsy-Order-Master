<script lang="ts" setup>
import { ref, computed, onMounted } from "vue";
import { getEtsyData } from "@/composables/useEtsyData";
import {
  orderStatesToOptions,
  getDefaultOrderStateId,
} from "@/composables/useOrderStates";
import {
  getOrderListBaseParams,
} from "@/composables/useFetchOrderList";
import { fetchEtsyOrdersPage } from "@/api/etsy-orders";
import {
  buildOrderListQueryParams,
  getOrderPageOffset,
  normalizeOrderPage,
  normalizeOrderPageSize,
  ORDER_PAGE_SIZE_OPTIONS,
} from "@/lib/order-list-query-utils.mjs";
import {
  EXPORT_COLUMNS,
  mapOrdersToTableRows,
  type ExportTableRow,
} from "@/utils/orders-mapping";
import * as XLSX from "xlsx";
import { syncOrdersToKst } from "@/lib/kst-order-sync";
import { useAuth } from "@/composables/useAuth";
import { useNotyf } from "@/composables/useNotyf";

const emit = defineEmits<{ (e: "close"): void }>();
const { isLoggedIn, openLoginPage, loadUser } = useAuth();
const notyf = useNotyf();

const loading = ref(true);
const error = ref<string | null>(null);
const rows = ref<ExportTableRow[]>([]);
const selected = ref<Set<number>>(new Set());
const orderStateOptions = ref<{ label: string; value: number }[]>([]);
const selectedOrderStateId = ref<number | "">("");
const pageSize = ref(20);
const currentPage = ref(1);
const searchTerms = ref("");
/** 最近一次实际请求使用的搜索词，用于展示「搜索范围」提示 */
const appliedSearchTerms = ref("");
const totalOrders = ref<number | null>(null);
const isSyncingToKst = ref(false);

const columns = EXPORT_COLUMNS;
const pageSizeOptions = ORDER_PAGE_SIZE_OPTIONS;

const selectedRows = computed(() =>
  rows.value.filter((_, i) => selected.value.has(i))
);

const totalPages = computed(() => {
  if (totalOrders.value == null) return null;
  return Math.max(1, Math.ceil(totalOrders.value / pageSize.value));
});

const canGoPrev = computed(() => currentPage.value > 1);
const canGoNext = computed(() => {
  if (totalPages.value != null) return currentPage.value < totalPages.value;
  return rows.value.length >= pageSize.value;
});

const groupedRowMeta = computed(() => {
  let currentGroup = -1;
  let lastOrderId = "";

  return rows.value.map((row, index) => {
    const orderId = String(row["Order ID"] ?? "");
    const isNewGroup = index === 0 || orderId !== lastOrderId;
    if (isNewGroup) {
      currentGroup += 1;
      lastOrderId = orderId;
    }

    return {
      groupIndex: currentGroup,
      isGroupStart: isNewGroup,
    };
  });
});

type RowGroupRow = { row: ExportTableRow; index: number };
type RowGroup = {
  groupIndex: number;
  orderId: string;
  rows: RowGroupRow[];
};

/**
 * 纯展示用的行分组：把连续同 Order ID 的行归到一组，用于多行订单的折叠展示。
 * 每一项都保留原始 rows 下标，勾选 / 导出 / 同步仍以下标为准，逻辑不受影响。
 */
const rowGroups = computed<RowGroup[]>(() => {
  const groups: RowGroup[] = [];

  rows.value.forEach((row, index) => {
    const meta = groupedRowMeta.value[index];
    const groupIndex = meta?.groupIndex ?? index;
    const last = groups[groups.length - 1];

    if (!last || last.groupIndex !== groupIndex) {
      groups.push({
        groupIndex,
        orderId: String(row["Order ID"] ?? ""),
        rows: [],
      });
    }

    groups[groups.length - 1].rows.push({ row, index });
  });

  return groups;
});

/** 折叠的多行订单（按 groupIndex 记录），仅影响展示 */
const collapsedGroups = ref<Set<number>>(new Set());

function isGroupCollapsed(groupIndex: number): boolean {
  return collapsedGroups.value.has(groupIndex);
}

function toggleGroupCollapse(groupIndex: number) {
  const next = new Set(collapsedGroups.value);
  if (next.has(groupIndex)) next.delete(groupIndex);
  else next.add(groupIndex);
  collapsedGroups.value = next;
}

/** 组内已选行数（仍按行下标统计，与明细行勾选口径一致） */
function getGroupSelectedCount(group: RowGroup): number {
  return group.rows.reduce(
    (count, item) => (selected.value.has(item.index) ? count + 1 : count),
    0
  );
}

function isGroupAllSelected(group: RowGroup): boolean {
  return (
    group.rows.length > 0 &&
    getGroupSelectedCount(group) === group.rows.length
  );
}

/** 组头勾选 = 批量切换该组所有明细行的下标，不改变导出/同步口径 */
function toggleGroupSelection(group: RowGroup) {
  const next = new Set(selected.value);
  if (isGroupAllSelected(group)) {
    group.rows.forEach((item) => next.delete(item.index));
  } else {
    group.rows.forEach((item) => next.add(item.index));
  }
  selected.value = next;
}

const isAllSelected = computed(() => {
  if (rows.value.length === 0) return false;
  return rows.value.every((_, i) => selected.value.has(i));
});

function toggleAll() {
  if (isAllSelected.value) {
    selected.value = new Set();
  } else {
    selected.value = new Set(rows.value.map((_, i) => i));
  }
}

function toggleRow(index: number) {
  const next = new Set(selected.value);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  selected.value = next;
}

function clearSelectedOrders() {
  selected.value = new Set();
}

async function fetchOrders(options?: {
  resetPage?: boolean;
  clearSelection?: boolean;
}) {
  if (options?.clearSelection) {
    clearSelectedOrders();
  }
  pageSize.value = normalizeOrderPageSize(pageSize.value);
  currentPage.value = normalizeOrderPage(
    options?.resetPage ? 1 : currentPage.value
  );

  loading.value = true;
  error.value = null;
  try {
    const etsy = await getEtsyData();
    if (!etsy.success || etsy.shopId == null) {
      error.value = etsy.error ?? "无法获取店铺 ID，请确保在 Etsy 订单页打开";
      return;
    }

    if (orderStateOptions.value.length === 0 && etsy.orderStates?.length) {
      orderStateOptions.value = orderStatesToOptions(etsy.orderStates);
      const defaultId = getDefaultOrderStateId(etsy.orderStates);
      if (selectedOrderStateId.value === "" && defaultId != null) {
        selectedOrderStateId.value = defaultId;
      }
    }

    const stateId =
      selectedOrderStateId.value !== "" ? String(selectedOrderStateId.value) : "";
    const searchText = searchTerms.value.trim();
    const baseParams = buildOrderListQueryParams(
      getOrderListBaseParams(stateId),
      {
        page: currentPage.value,
        pageSize: pageSize.value,
        searchTerms: searchText,
        omitOrderState: stateId === "",
        omitOrderStateOnSearch: true,
      }
    );

    const { orders: orderList, buyers, totalSearchHitCount, totalCount } =
      await fetchEtsyOrdersPage(
        etsy.shopId,
        baseParams,
        pageSize.value,
        getOrderPageOffset(currentPage.value, pageSize.value),
        { credentials: "include" }
      );

    // 暂时停用详情接口，只使用列表接口数据生成表格。
    // 如需恢复 Card Processing Fees，可重新启用 earnings details 请求并传入 earningsByOrderId。
    // const earningsByOrderId: Record<
    //   number,
    //   { fees_and_credits_details?: { processing_fee?: { amount?: number; divisor?: number } } }
    // > = {};
    // const shopId = etsy.shopId;
    // await Promise.all(
    //   orderList.map(async (order) => {
    //     const orderId = order.order_id as number;
    //     try {
    //       const earningsUrl = `https://www.etsy.com/api/v3/ajax/shop/${shopId}/mission-control/orders/earnings/${orderId}/details/all?include_refunded_labels=true&include_vat_in_sum=true`;
    //       const er = await fetch(earningsUrl, { method: "GET", credentials: "include" });
    //       if (!er.ok) return;
    //       const earningsData = await er.json();
    //       if (earningsData?.fees_and_credits_details?.processing_fee != null) {
    //         earningsByOrderId[orderId] = {
    //           fees_and_credits_details: {
    //             processing_fee: earningsData.fees_and_credits_details.processing_fee,
    //           },
    //         };
    //       }
    //     } catch {
    //       // 单笔详情失败不影响其他订单，Card Processing Fees 留空
    //     }
    //   })
    // );

    rows.value = mapOrdersToTableRows(
      orderList as Parameters<typeof mapOrdersToTableRows>[0],
      buyers as Parameters<typeof mapOrdersToTableRows>[1],
      { shopId: etsy.shopId }
    );
    // 换页/换筛选后行分组已变，折叠状态一并重置（仅展示态）
    collapsedGroups.value = new Set();
    appliedSearchTerms.value = searchText;
    totalOrders.value = totalSearchHitCount ?? totalCount ?? orderList.length;

    if (totalPages.value != null && currentPage.value > totalPages.value) {
      currentPage.value = totalPages.value;
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "获取订单失败";
  } finally {
    loading.value = false;
  }
}

function changeOrderState() {
  void fetchOrders({ resetPage: true, clearSelection: true });
}

function clearOrderState() {
  selectedOrderStateId.value = "";
  void fetchOrders({ resetPage: true, clearSelection: true });
}

function changePageSize() {
  void fetchOrders({ resetPage: true, clearSelection: true });
}

function applySearch() {
  // 搜索仍走 Etsy 的全店范围（接口在带 search_terms 时会忽略 order_state 过滤），
  // 但不再静默清空状态下拉；实际生效范围由输入框旁的「搜索范围」提示说明。
  void fetchOrders({ resetPage: true, clearSelection: true });
}

function goToPage(page: unknown) {
  const nextPage = normalizeOrderPage(page);
  if (totalPages.value != null && nextPage > totalPages.value) {
    currentPage.value = totalPages.value;
  } else {
    currentPage.value = nextPage;
  }
  void fetchOrders({ clearSelection: true });
}

function goPrevPage() {
  if (!canGoPrev.value) return;
  goToPage(currentPage.value - 1);
}

function goNextPage() {
  if (!canGoNext.value) return;
  goToPage(currentPage.value + 1);
}

function exportSelected() {
  const data = selectedRows.value;
  if (data.length === 0) {
    return;
  }
  const ws = XLSX.utils.json_to_sheet(data, { header: [...columns] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Orders");
  const name = `orders-new-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, name);
}

async function syncSelectedToKst() {
  const data = selectedRows.value;
  if (data.length === 0) {
    notyf.error("请先选择要同步的订单");
    return;
  }
  loading.value = true;

  await loadUser();
  if (!isLoggedIn.value) {
    error.value = "请先登录 KST 账号后再同步订单";
    notyf.error("请先登录 KST 账号后再同步订单");
    loading.value = false;
    openLoginPage();
    return;
  }

  isSyncingToKst.value = true;
  error.value = null;

  try {
    const etsy = await getEtsyData();
    if (!etsy.success || etsy.shopId == null) {
      console.warn("[KST] 无法获取 shopId，取消同步");
      notyf.error("无法获取店铺信息，请确保在 Etsy 订单页操作");
      return;
    }

    const synced = await syncOrdersToKst({
      shopId: etsy.shopId,
      rows: data,
      logContext: {
        source: "manual_order_export_modal",
        pageUrl: location.href,
      },
    });
    // 同步成功即关闭弹窗，结果由全局提示告知
    if (synced) close();
  } catch (e) {
    console.error("[KST] 同步到 KST 失败", e);
    const msg = e instanceof Error ? e.message : "同步失败，请重试";
    notyf.error(msg);
  } finally {
    isSyncingToKst.value = false;
    loading.value = false;
  }
}

function close() {
  emit("close");
}

let overlayMouseDownOnSelf = false;

function onOverlayMouseDown(event: MouseEvent) {
  overlayMouseDownOnSelf = event.target === event.currentTarget;
}

function onOverlayClick(event: MouseEvent) {
  if (overlayMouseDownOnSelf && event.target === event.currentTarget) {
    close();
  }
  overlayMouseDownOnSelf = false;
}


onMounted(() => {
  fetchOrders();
});
</script>

<template>
  <div
    class="modal-overlay"
    @mousedown="onOverlayMouseDown"
    @click="onOverlayClick"
  >
    <div class="modal">
      <div class="modal-header">
        <div class="modal-header-left">
          <h2 class="modal-title">订单管理</h2>
          <div v-if="orderStateOptions.length > 0" class="state-select-wrap">
            <span class="state-select-label">订单状态</span>
            <select
              v-model.number="selectedOrderStateId"
              class="state-select"
              :disabled="loading"
              @change="changeOrderState"
            >
              <option :value="''">全部状态</option>
              <option
                v-for="opt in orderStateOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
            <button
              type="button"
              class="btn-clear-state"
              :disabled="loading || selectedOrderStateId === ''"
              @click="clearOrderState"
            >
              清空
            </button>
          </div>
          <label class="page-size-wrap">
            <span class="page-size-label">每页</span>
            <select
              v-model.number="pageSize"
              class="page-size-select"
              :disabled="loading"
              @change="changePageSize"
            >
              <option v-for="size in pageSizeOptions" :key="size" :value="size">
                {{ size }}
              </option>
            </select>
          </label>
          <div class="search-wrap">
            <label class="search-label" for="order-search-input">订单号</label>
            <input
              id="order-search-input"
              v-model="searchTerms"
              type="search"
              inputmode="numeric"
              class="search-input"
              placeholder="输入订单号"
              :disabled="loading"
              @keydown.enter.prevent="applySearch"
              @search="applySearch"
            />
            <button
              type="button"
              class="btn-search"
              :disabled="loading"
              @click="applySearch"
            >
              搜索
            </button>
            <span v-if="appliedSearchTerms" class="search-scope-hint">
              搜索范围：全部状态
            </span>
          </div>
          <div class="pagination-wrap">
            <button
              type="button"
              class="btn-page"
              :disabled="loading || !canGoPrev"
              @click="goPrevPage"
            >
              上一页
            </button>
            <label class="page-number-wrap">
              <span class="page-number-label">第</span>
              <input
                v-model.number="currentPage"
                type="number"
                min="1"
                class="page-number-input"
                :disabled="loading"
                @change="goToPage(currentPage)"
              />
              <span class="page-number-label">
                页{{ totalPages ? ` / ${totalPages}` : "" }}
              </span>
            </label>
            <button
              type="button"
              class="btn-page"
              :disabled="loading || !canGoNext"
              @click="goNextPage"
            >
              下一页
            </button>
          </div>
        </div>
        <button type="button" class="btn-close" aria-label="关闭" @click="close">
          ×
        </button>
      </div>

      <div class="modal-body">
        <div v-if="loading" class="loading">加载中…</div>
        <div v-else-if="error" class="error">
          <p>{{ error }}</p>
          <button type="button" class="btn-retry" @click="fetchOrders()">
            重试
          </button>
        </div>
        <div v-else-if="rows.length === 0" class="empty">
          未找到订单
        </div>
        <div v-else class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th class="col-check">
                  <input
                    type="checkbox"
                    :checked="isAllSelected"
                    :indeterminate="selected.size > 0 && !isAllSelected"
                    @change="toggleAll"
                  />
                </th>
                <th v-for="col in columns" :key="col" class="col-data">{{ col }}</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="group in rowGroups" :key="group.groupIndex">
                <tr v-if="group.rows.length > 1" class="table-group-row">
                  <td :colspan="columns.length + 1">
                    <div class="table-group-bar">
                      <div class="table-group-bar-inner">
                        <button
                          type="button"
                          class="table-group-toggle"
                          :class="{ 'is-collapsed': isGroupCollapsed(group.groupIndex) }"
                          :aria-expanded="!isGroupCollapsed(group.groupIndex)"
                          :title="
                            isGroupCollapsed(group.groupIndex)
                              ? '展开该订单'
                              : '收起该订单'
                          "
                          @click="toggleGroupCollapse(group.groupIndex)"
                        >
                          <svg
                            viewBox="0 0 12 12"
                            width="12"
                            height="12"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.6"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M2 4.2l4 4 4-4" />
                          </svg>
                        </button>
                        <input
                          type="checkbox"
                          class="table-group-check"
                          :checked="isGroupAllSelected(group)"
                          :indeterminate="
                            getGroupSelectedCount(group) > 0 &&
                            !isGroupAllSelected(group)
                          "
                          :aria-label="`勾选订单 ${group.orderId} 的全部明细`"
                          @change="toggleGroupSelection(group)"
                        />
                        <span class="table-group-order">订单 {{ group.orderId }}</span>
                        <span class="table-group-count">
                          {{ group.rows.length }} 项
                        </span>
                        <span
                          v-if="getGroupSelectedCount(group) > 0"
                          class="table-group-selected"
                        >
                          已选 {{ getGroupSelectedCount(group) }}
                        </span>
                      </div>
                    </div>
                  </td>
                </tr>
                <tr
                  v-for="item in group.rows"
                  v-show="group.rows.length === 1 || !isGroupCollapsed(group.groupIndex)"
                  :key="item.index"
                  :class="[
                    'table-row',
                    groupedRowMeta[item.index]?.groupIndex % 2 === 0 ? 'table-row-group-even' : 'table-row-group-odd',
                    {
                      'table-row-group-start': group.rows.length === 1 && groupedRowMeta[item.index]?.isGroupStart,
                      'table-row-child': group.rows.length > 1,
                    },
                  ]"
                >
                  <td class="col-check">
                    <input
                      type="checkbox"
                      :checked="selected.has(item.index)"
                      @change="toggleRow(item.index)"
                    />
                  </td>
                  <td v-for="col in columns" :key="col" class="col-data">
                    {{ item.row[col] }}
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>

      <div class="modal-footer">
        <span>
          当前页 {{ rows.length }} 条，已选 {{ selectedRows.length }} 条明细
          <template v-if="totalOrders != null">，共 {{ totalOrders }} 条</template>
        </span>
       <div>
        <button
          type="button"
          class="btn-export"
          :disabled="loading || isSyncingToKst || !!error || selectedRows.length === 0"
          @click="syncSelectedToKst"
        >
          同步到 KST 订单系统 (会自动进行去重)
        </button>
        <button
          type="button"
          class="btn-export"
          :disabled="loading || isSyncingToKst || !!error || selectedRows.length === 0"
          @click="exportSelected"
        >
          导出 Excel
        </button>
       </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal {
  background: #fff;
  border-radius: 12px;
  width: 95vw;
  height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
}

.modal-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.state-select-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.state-select-label {
  font-size: 14px;
  color: #6b7280;
}

.state-select {
  padding: 6px 10px;
  font-size: 14px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  min-width: 120px;
}

.state-select:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.btn-clear-state {
  padding: 7px 10px;
  font-size: 14px;
  color: #374151;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
}

.btn-clear-state:hover:not(:disabled) {
  background: #f9fafb;
  border-color: #9ca3af;
}

.btn-clear-state:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.page-size-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.page-size-label {
  font-size: 14px;
  color: #6b7280;
}

.page-size-select {
  width: 76px;
  padding: 6px 8px;
  font-size: 14px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
}

.page-size-select:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.search-wrap,
.pagination-wrap,
.page-number-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.search-label,
.page-number-label {
  font-size: 14px;
  color: #6b7280;
}

.search-scope-hint {
  font-size: 12px;
  color: #b45309;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 4px;
  padding: 2px 6px;
  white-space: nowrap;
}

.search-input {
  width: 160px;
  padding: 6px 8px;
  font-size: 14px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
}

.page-number-input {
  width: 64px;
  padding: 6px 8px;
  font-size: 14px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
}

.search-input:disabled,
.page-number-input:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  background: #f3f4f6;
}

.btn-search,
.btn-page {
  padding: 7px 10px;
  font-size: 14px;
  color: #374151;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
}

.btn-search:hover:not(:disabled),
.btn-page:hover:not(:disabled) {
  background: #f9fafb;
  border-color: #9ca3af;
}

.btn-search:disabled,
.btn-page:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.modal-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.btn-close {
  width: 32px;
  height: 32px;
  font-size: 24px;
  line-height: 1;
  color: #6b7280;
  background: none;
  border: none;
  cursor: pointer;
  border-radius: 6px;
}

.btn-close:hover {
  background: #f3f4f6;
  color: #374151;
}

.modal-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px 20px;
}

.loading,
.error,
.empty {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px 20px;
  color: #6b7280;
}

.error p {
  margin: 0 0 12px;
}

.btn-retry {
  padding: 8px 16px;
  font-size: 14px;
  color: #fff;
  background: #3b82f6;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.btn-retry:hover {
  background: #2563eb;
}

.table-wrap {
  overflow-x: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.table th,
.table td {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid #e5e7eb;
}

.table-row-group-even td {
  background: #fcfcfd;
}

.table-row-group-odd td {
  background: #f7fafc;
}

.table-row-group-start td {
  border-top: 2px solid #cbd5e1;
}

/* 多行订单的折叠组头：整行铺满，文字在横向滚动时吸附在左侧 */
.table-group-row td {
  padding: 0;
  border-bottom: 1px solid #dfe7f2;
  background: transparent;
}

.table-group-bar {
  display: flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  background: #f2f6fc;
  border-left: 3px solid #4a86c8;
  box-shadow: inset 0 -1px 0 #dde7f4;
  font-size: 13px;
}

.table-group-bar-inner {
  position: sticky;
  left: 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  max-width: calc(100% - 24px);
}

/* 归属该订单的明细行：整体右移，并用左侧竖线连成归属轨道 */
.table-row.table-row-child > td {
  background: #fbfdff;
}

.table-row-child > td:first-child {
  padding-left: 24px;
  text-align: left;
  box-shadow: inset 3px 0 0 #dfe8f5;
}

.table-row.table-row-child:hover > td {
  background: #f4f9ff;
}

.table-group-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  padding: 0;
  color: #4a86c8;
  background: none;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.table-group-toggle:hover {
  background: #dfeaf8;
}

.table-group-toggle svg {
  transition: transform 0.15s ease;
}

.table-group-toggle.is-collapsed svg {
  transform: rotate(-90deg);
}

.table-group-order {
  font-weight: 600;
  color: #1f3f66;
  letter-spacing: 0.2px;
  white-space: nowrap;
}

.table-group-check {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  margin: 0;
  cursor: pointer;
}

.table-group-selected {
  color: #1d4ed8;
  background: #dbeafe;
  border-radius: 999px;
  padding: 1px 8px;
  white-space: nowrap;
}

.table-group-count {
  color: #475569;
  background: #e4ecf7;
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 12px;
  white-space: nowrap;
}

.table th {
  position: sticky;
  top: 0;
  z-index: 1;
  font-weight: 600;
  color: #374151;
  background: #f9fafb;
}

.col-check {
  width: 40px;
  text-align: center;
}

.col-check input {
  cursor: pointer;
}

.col-data {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modal-footer {
  flex-shrink: 0;
  padding: 12px 20px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.btn-export {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  color: #fff;
  background: #3b82f6;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.btn-export {
  margin-left: 12px;
}

.btn-export:hover:not(:disabled) {
  background: #2563eb;
}

.btn-export:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}
</style>
