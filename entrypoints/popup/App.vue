<template>
  <div class="popup-container">
    <div class="header">
      <h1 class="title">Etsy Order Master</h1>
    </div>

    <div class="content">
      <!-- 表单参数 -->
      <div class="form-section">
        <!-- 订单状态和数量 -->
        <div class="form-row">
          <div class="form-group">
            <label class="label">订单状态</label>
            <select
              v-model.number="formParams.orderStateId"
              class="select"
              :disabled="isLoading"
            >
              <option
                v-for="(id, label) in orderStateIdMap"
                :key="id"
                :value="id"
              >
                {{ label }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label class="label">数量</label>
            <input
              v-model.number="formParams.limit"
              type="number"
              min="1"
              class="input"
              :disabled="isLoading"
            />
          </div>
        </div>

        <!-- Ship by date 单选 -->
        <div class="form-group">
          <label class="label">Ship by date</label>
          <div class="radio-group">
            <label
              v-for="(value, label) in shipDateMap"
              :key="value"
              class="radio-label"
            >
              <input
                v-model="formParams.shipDate"
                type="radio"
                :value="value"
                :disabled="isLoading"
                class="radio"
              />
              <span class="radio-text">{{ label }}</span>
            </label>
          </div>
        </div>

        <!-- Destination 单选 -->
        <div class="form-group">
          <label class="label">Destination</label>
          <div class="radio-group">
            <label
              v-for="(value, label) in destinationMap"
              :key="value"
              class="radio-label"
            >
              <input
                v-model="formParams.destination"
                type="radio"
                :value="value"
                :disabled="isLoading"
                class="radio"
              />
              <span class="radio-text">{{ label }}</span>
            </label>
          </div>
        </div>

        <!-- Order details 复选框 -->
        <div class="form-group">
          <label class="label">Order details</label>
          <div class="checkbox-group">
            <label class="checkbox-label">
              <input
                v-model="formParams.hasBuyerNotes"
                type="checkbox"
                :disabled="isLoading"
                class="checkbox"
              />
              <span class="checkbox-text">Has note from buyer</span>
            </label>
            <label class="checkbox-label">
              <input
                v-model="formParams.isMarkedAsGift"
                type="checkbox"
                :disabled="isLoading"
                class="checkbox"
              />
              <span class="checkbox-text">Marked as gift</span>
            </label>
            <label class="checkbox-label">
              <input
                v-model="formParams.isPersonalized"
                type="checkbox"
                :disabled="isLoading"
                class="checkbox"
              />
              <span class="checkbox-text">Personalized</span>
            </label>
          </div>
        </div>

        <!-- Shipping 复选框 -->
        <div class="form-group">
          <label class="label">Shipping</label>
          <label class="checkbox-label">
            <input
              v-model="formParams.hasShippingUpgrade"
              type="checkbox"
              :disabled="isLoading"
              class="checkbox"
            />
            <span class="checkbox-text">Upgrade requested</span>
          </label>
        </div>
      </div>

      <button
        @click="fetchAndExportOrders"
        class="submit-button"
        :disabled="isLoading"
      >
        {{ isLoading ? "加载中..." : "获取订单" }}
      </button>

      <!-- 状态显示 -->
      <div v-if="orderCount > 0 || exportStatus" class="status-section">
        <div
          v-if="orderCount > 0"
          class="status-message status-success"
        >
          <span class="status-label">获取成功：</span>
          共获取到 {{ orderCount }} 条订单
        </div>
        <div
          v-if="exportStatus"
          :class="[
            'status-message',
            exportStatus === 'success' ? 'status-success' : 'status-error',
          ]"
        >
          <span class="status-label">
            {{ exportStatus === "success" ? "导出成功" : "导出失败" }}：
          </span>
          {{ exportMessage }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { CSV_HEADERS, buildCSVContent, downloadCSV } from "@/utils/csv-utils";

// 订单类型定义
type Order = {
  order_id: number;
  [key: string]: any;
};

// 响应式状态
const isLoading = ref(false);
const orderCount = ref(0);
const exportStatus = ref<"success" | "error" | "">("");
const exportMessage = ref("");

const orderStateIdMap = {
  New: 1407795702316,
  处理中: 1428563163555,
  生产中: 1428305118910,
  待确认: 1428305118916,
  无图: 1428305118926,
  Completed: 1407795702360,
};

// ship_date
const shipDateMap = {
  All: "all",
  Overdue: "ship_date_overdue",
  Today: "ship_date_today",
  Tomorrow: "ship_date_tomorrow",
  "Within a week": "ship_date_this_week",
  "No estimate": "no_estimate",
};

// destination
const destinationMap = {
  All: "all",
  China: "domestic",
  "United States": "united_states",
  "Everywhere else": "everywhere_else",
};

// 表单参数对象
const formParams = ref({
  orderStateId: orderStateIdMap["待确认"],
  limit: 20,
  shipDate: shipDateMap.All,
  destination: destinationMap.All,
  hasBuyerNotes: false,
  isMarkedAsGift: false,
  isPersonalized: false,
  hasShippingUpgrade: false,
});

// CSV 导出函数
function exportToCSV(orders: Order[], filename: string = "backFillEn"): void {
  try {
    // 构建 CSV 数据行
    const rows = orders.map((order) => {
      return [
        String(order.order_id), // Etsy Order Number
        "", // Tracking Number (空)
        "", // Shipping Carrier (空)
      ];
    });

    // 使用工具函数构建 CSV 内容
    const csvContent = buildCSVContent(CSV_HEADERS, rows);

    // 使用工具函数下载 CSV
    downloadCSV(csvContent, filename);

    console.log(`✅ CSV 导出成功：${orders.length} 条订单`);
  } catch (error) {
    console.error("❌ CSV 导出失败:", error);
    throw error;
  }
}

// 获取订单数据并导出
async function fetchAndExportOrders() {
  isLoading.value = true;
  orderCount.value = 0;
  exportStatus.value = "";
  exportMessage.value = "";

  try {
    // 构建参数对象
    const params: Record<string, string> = {
      "filters[buyer_id]": "all",
      "filters[channel]": "all",
      "filters[completed_status]": "all",
      "filters[completed_date]": "all",
      "filters[destination]": formParams.value.destination,
      "filters[ship_date]": formParams.value.shipDate,
      "filters[shipping_label_eligibility]": "false",
      "filters[shipping_label_status]": "all",
      "filters[has_buyer_notes]": formParams.value.hasBuyerNotes ? "true" : "false",
      "filters[is_marked_as_gift]": formParams.value.isMarkedAsGift ? "true" : "false",
      "filters[is_personalized]": formParams.value.isPersonalized ? "true" : "false",
      "filters[has_shipping_upgrade]": formParams.value.hasShippingUpgrade ? "true" : "false",
      "filters[order_state_id]": String(formParams.value.orderStateId),
      limit: String(formParams.value.limit),
      offset: "0",
      search_terms: "",
      sort_by: "expected_ship_date",
      sort_order: "asc",
      "objects_enabled_for_normalization[order_state]": "true",
    };

    // 构建完整的 URL
    const baseUrl =
      "https://www.etsy.com/api/v3/ajax/bespoke/shop/62018722/mission-control/orders/data";
    const url = baseUrl + "?" + new URLSearchParams(params).toString();

    console.log("请求 URL:", url);

    // 发送 fetch 请求
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        accept: "*/*",
        "accept-language": "zh-HK,zh-TW;q=0.9,zh;q=0.8",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
      },
    });

    console.log("响应状态:", response.status);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log("响应数据:", data);

    const fetchedOrders = data?.orders_search?.orders || [];
    console.log("订单列表:", fetchedOrders);

    // 更新订单数量
    orderCount.value = fetchedOrders.length;

    if (fetchedOrders.length === 0) {
      exportStatus.value = "error";
      exportMessage.value = "未获取到任何订单数据";
      return;
    }

    // 导出 CSV
    const filename = `backFillEn`;
    exportToCSV(fetchedOrders, filename);

    // 更新导出状态
    exportStatus.value = "success";
    exportMessage.value = `已成功导出 ${fetchedOrders.length} 条订单到 CSV 文件`;
  } catch (error) {
    console.error("获取订单失败:", error);
    exportStatus.value = "error";
    exportMessage.value =
      error instanceof Error ? error.message : "获取订单失败，请检查控制台";
  } finally {
    isLoading.value = false;
  }
}
</script>

<style scoped>
.popup-container {
  width: 320px;
  max-height: 600px;
  background: white;
  overflow-y: auto;
}

.header {
  padding: 12px;
}

.title {
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
}

.content {
  padding: 12px;
  padding-top: 0;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  display: block;
  font-size: 12px;
  color: #4b5563;
  margin-bottom: 4px;
}

.select,
.input {
  width: 100%;
  padding: 6px 8px;
  font-size: 14px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: white;
  color: #374151;
  box-sizing: border-box;
}

.select:focus,
.input:focus {
  outline: none;
  box-shadow: 0 0 0 1px #3b82f6;
  border-color: #3b82f6;
}

.select:disabled,
.input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background: #f3f4f6;
}

.radio-group,
.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 12px;
}

.radio-label,
.checkbox-label {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.radio {
  width: 14px;
  height: 14px;
  margin: 0;
  cursor: pointer;
  accent-color: #3b82f6;
}

.radio:disabled {
  cursor: not-allowed;
}

.radio-text {
  margin-left: 6px;
  font-size: 12px;
  color: #374151;
}

.checkbox {
  width: 14px;
  height: 14px;
  margin: 0;
  cursor: pointer;
  accent-color: #3b82f6;
  border-radius: 3px;
}

.checkbox:disabled {
  cursor: not-allowed;
}

.checkbox-text {
  margin-left: 6px;
  font-size: 12px;
  color: #374151;
}

.submit-button {
  width: 100%;
  padding: 8px 12px;
  font-size: 14px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
  margin-bottom: 12px;
}

.submit-button:hover:not(:disabled) {
  background: #2563eb;
}

.submit-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.status-message {
  padding: 6px 10px;
  font-size: 12px;
  border-radius: 4px;
}

.status-success {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
}

.status-error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
}

.status-label {
  font-weight: 500;
}
</style>
