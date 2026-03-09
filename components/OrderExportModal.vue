<script lang="ts" setup>
import { ref, computed, onMounted } from "vue";
import { getEtsyData } from "@/composables/useEtsyData";
import {
  orderStatesToOptions,
  getDefaultOrderStateId,
} from "@/composables/useOrderStates";
import { fetchOrderList } from "@/composables/useFetchOrderList";
import {
  EXPORT_COLUMNS,
  mapOrdersToTableRows,
  type ExportTableRow,
} from "@/utils/orders-mapping";
import * as XLSX from "xlsx";

const emit = defineEmits<{ (e: "close"): void }>();

const loading = ref(true);
const error = ref<string | null>(null);
const rows = ref<ExportTableRow[]>([]);
const selected = ref<Set<number>>(new Set());
const orderStateOptions = ref<{ label: string; value: number }[]>([]);
const selectedOrderStateId = ref<number | "">("");
const pageSize = ref(999);

const columns = EXPORT_COLUMNS;

const selectedRows = computed(() =>
  rows.value.filter((_, i) => selected.value.has(i))
);

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

async function fetchOrders() {
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

    const stateIdRaw =
      selectedOrderStateId.value !== ""
        ? selectedOrderStateId.value
        : orderStateOptions.value[0]?.value;
    if (stateIdRaw == null) {
      error.value = "无法获取订单状态";
      return;
    }
    const stateId = String(stateIdRaw);

    const baseParams: Record<string, string> = {
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

    const { orders: orderList, buyers } = await fetchOrderList(
      etsy.shopId,
      pageSize.value,
      baseParams,
      { credentials: "include" }
    );

    const earningsByOrderId: Record<
      number,
      { fees_and_credits_details?: { processing_fee?: { amount?: number; divisor?: number } } }
    > = {};
    const shopId = etsy.shopId;
    await Promise.all(
      orderList.map(async (order) => {
        const orderId = order.order_id as number;
        try {
          const earningsUrl = `https://www.etsy.com/api/v3/ajax/shop/${shopId}/mission-control/orders/earnings/${orderId}/details/all?include_refunded_labels=true&include_vat_in_sum=true`;
          const er = await fetch(earningsUrl, { method: "GET", credentials: "include" });
          if (!er.ok) return;
          const earningsData = await er.json();
          if (earningsData?.fees_and_credits_details?.processing_fee != null) {
            earningsByOrderId[orderId] = {
              fees_and_credits_details: {
                processing_fee: earningsData.fees_and_credits_details.processing_fee,
              },
            };
          }
        } catch {
          // 单笔详情失败不影响其他订单，Card Processing Fees 留空
        }
      })
    );

    rows.value = mapOrdersToTableRows(
      orderList as Parameters<typeof mapOrdersToTableRows>[0],
      buyers as Parameters<typeof mapOrdersToTableRows>[1],
      { earningsByOrderId, shopId: etsy.shopId }
    );
    selected.value = new Set(rows.value.map((_, i) => i));
  } catch (e) {
    error.value = e instanceof Error ? e.message : "获取订单失败";
  } finally {
    loading.value = false;
  }
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

function close() {
  emit("close");
}


onMounted(() => {
  fetchOrders();
});
</script>

<template>
  <div class="modal-overlay" @click.self="close">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-header-left">
          <h2 class="modal-title">订单导出</h2>
          <label v-if="orderStateOptions.length > 0" class="state-select-wrap">
            <span class="state-select-label">订单状态</span>
            <select
              v-model.number="selectedOrderStateId"
              class="state-select"
              :disabled="loading"
              @change="fetchOrders"
            >
              <option
                v-for="opt in orderStateOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
          </label>
          <label class="page-size-wrap">
            <span class="page-size-label">数量</span>
            <input
              v-model.number="pageSize"
              type="number"
              min="1"
              max="999"
              class="page-size-input"
              :disabled="loading"
              @change="fetchOrders"
            />
          </label>
        </div>
        <button type="button" class="btn-close" aria-label="关闭" @click="close">
          ×
        </button>
      </div>

      <div class="modal-body">
        <div v-if="loading" class="loading">加载中…</div>
        <div v-else-if="error" class="error">
          <p>{{ error }}</p>
          <button type="button" class="btn-retry" @click="fetchOrders">
            重试
          </button>
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
              <tr v-for="(row, i) in rows" :key="i">
                <td class="col-check">
                  <input
                    type="checkbox"
                    :checked="selected.has(i)"
                    @change="toggleRow(i)"
                  />
                </td>
                <td v-for="col in columns" :key="col" class="col-data">
                  {{ row[col] }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="modal-footer">
        <button
          type="button"
          class="btn-export"
          :disabled="loading || !!error || selectedRows.length === 0"
          @click="exportSelected"
        >
          导出 ({{ selectedRows.length }})
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal {
  background: #fff;
  border-radius: 12px;
  max-width: 95vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
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

.page-size-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.page-size-label {
  font-size: 14px;
  color: #6b7280;
}

.page-size-input {
  width: 80px;
  padding: 6px 8px;
  font-size: 14px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
}

.page-size-input:disabled {
  opacity: 0.7;
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
  overflow: auto;
  padding: 16px 20px;
}

.loading,
.error {
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

.table th {
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
  padding: 12px 20px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
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

.btn-export:hover:not(:disabled) {
  background: #2563eb;
}

.btn-export:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}
</style>
