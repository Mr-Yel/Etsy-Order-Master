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
        <div v-if="orderCount > 0" class="status-message status-success">
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
import { ref, onMounted } from "vue";
import { CSV_HEADERS, buildCSVContent, downloadCSV } from "@/utils/csv-utils";

// 订单类型定义
type Order = {
  order_id: number;
  [key: string]: any;
};

// 订单状态类型定义
type OrderState = {
  type: string;
  order_state_id: number;
  client_id: number | null;
  position: number;
  name: string;
  state_type: string;
  order_count: number | null;
  actions: string[];
};

// 响应式状态
const isLoading = ref(false);
const orderCount = ref(0);
const exportStatus = ref<"success" | "error" | "">("");
const exportMessage = ref("");
const shopId = ref<number | null>(null);

// 动态订单状态映射（从 Etsy API 获取）
const orderStateIdMap = ref<Record<string, number>>({});

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
  orderStateId: 0, // 初始值，会在获取到 orderStates 后更新
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

/**
 * 将 orderStates 数组转换为 orderStateIdMap 格式
 * @param orderStates 订单状态数组
 * @returns Record<string, number> 格式的映射对象
 */
function convertOrderStatesToMap(
  orderStates: OrderState[]
): Record<string, number> {
  const map: Record<string, number> = {};
  if (orderStates && Array.isArray(orderStates)) {
    orderStates.forEach((state) => {
      if (state.name && state.order_state_id) {
        map[state.name] = state.order_state_id;
      }
    });
  }
  return map;
}

// 通过 content script 获取 shopId 和 orderStates
async function getShopIdFromContentScript(): Promise<{
  shopId: number | null;
  orderStates: OrderState[] | null;
}> {
  try {
    // 获取当前活动标签页
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (tabs.length === 0 || !tabs[0].id) {
      console.warn("未找到活动标签页");
      return { shopId: null, orderStates: null };
    }

    const tabId = tabs[0].id;

    // 直接发送消息到 content script 获取 Etsy 数据
    // 让 content script 来判断是否在 Etsy 页面以及数据是否存在
    const response = await browser.tabs.sendMessage(tabId, {
      type: "GET_SHOP_ID",
    });

    if (response?.success && response?.shopId !== undefined) {
      console.log("✅ 成功获取 shopId:", response.shopId);
      console.log("✅ 成功获取 orderStates:", response.orderStates);

      // 更新 orderStateIdMap
      if (response.orderStates) {
        const newMap = convertOrderStatesToMap(response.orderStates);
        orderStateIdMap.value = newMap;
        console.log("✅ 已更新 orderStateIdMap:", newMap);

        // 如果 formParams.orderStateId 还是初始值 0，则设置为第一个订单状态
        if (
          formParams.value.orderStateId === 0 &&
          response.orderStates &&
          response.orderStates.length > 0
        ) {
          const firstStateId = Object.values(newMap)[0];
          if (firstStateId) {
            formParams.value.orderStateId = firstStateId;
          }
        }
      }

      return {
        shopId: response.shopId,
        orderStates: response.orderStates || null,
      };
    } else {
      console.warn("⚠️ 获取 Etsy 数据失败:", response?.error || "未知错误");
      return { shopId: null, orderStates: null };
    }
  } catch (error) {
    // 处理 content script 未注入的情况
    if (
      error instanceof Error &&
      error.message.includes("Could not establish connection")
    ) {
      console.error("Content script 未注入，可能需要刷新页面");
    } else {
      console.error("获取 Etsy 数据时发生错误:", error);
    }
    return { shopId: null, orderStates: null };
  }
}

// 获取订单数据并导出
/**
 * 使用 chrome.cookies API 获取所有 cookie（包括 HttpOnly）
 * 这是更可靠的方法，可以获取浏览器实际发送的 cookie
 */
async function getCookiesFromBrowser(): Promise<string | null> {
  try {
    // 获取当前活动标签页
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tabs.length === 0 || !tabs[0].url) {
      console.warn("未找到活动标签页");
      return null;
    }

    const tabUrl = tabs[0].url;

    // // 检查是否是 etsy.com 的页面
    // if (!tabUrl || !tabUrl.includes('etsy.com')) {
    //   console.warn("当前标签页不是 Etsy 页面:", tabUrl);
    //   return null;
    // }

    // 解析 URL 获取域名
    const urlObj = new URL(tabUrl);
    const domain = urlObj.hostname;

    // 使用 chrome.cookies API 获取所有 cookie（包括 HttpOnly）
    const cookies = await browser.cookies.getAll({
      domain: domain,
    });

    if (cookies.length === 0) {
      console.warn("未找到任何 cookie");
      return null;
    }

    // 将 cookie 数组转换为 Cookie 请求头格式
    const cookieString = cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");

    console.log("✅ 成功获取浏览器 cookie（包括 HttpOnly）");
    console.log("📋 Cookie 数量:", cookies.length);
    console.log("📋 Cookie 字符串长度:", cookieString.length);

    // 调试：检查 datadome cookie
    const datadomeCookie = cookies.find((c) => c.name === "datadome");
    if (datadomeCookie) {
      console.log("🔍 datadome cookie 值:", datadomeCookie.value);
      console.log("🔍 datadome cookie HttpOnly:", datadomeCookie.httpOnly);
    }

    return cookieString;
  } catch (error) {
    console.error("获取 cookie 时发生错误:", error);
    return null;
  }
}

/**
 * 执行单次订单请求
 * @param shopId 店铺 ID
 * @param limit 本次请求的 limit
 * @param offset 本次请求的 offset
 * @returns Promise<Order[]> 订单数组
 */
async function fetchOrdersPage(
  shopId: number,
  limit: number,
  offset: number
): Promise<Order[]> {
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
    "filters[has_buyer_notes]": formParams.value.hasBuyerNotes
      ? "true"
      : "false",
    "filters[is_marked_as_gift]": formParams.value.isMarkedAsGift
      ? "true"
      : "false",
    "filters[is_personalized]": formParams.value.isPersonalized
      ? "true"
      : "false",
    "filters[has_shipping_upgrade]": formParams.value.hasShippingUpgrade
      ? "true"
      : "false",
    "filters[order_state_id]": String(formParams.value.orderStateId),
    limit: String(limit),
    offset: String(offset),
    search_terms: "",
    sort_by: "expected_ship_date",
    sort_order: "asc",
    "objects_enabled_for_normalization[order_state]": "true",
  };

  // 构建完整的 URL
  const baseUrl = `https://www.etsy.com/api/v3/ajax/bespoke/shop/${shopId}/mission-control/orders/data`;
  const url = baseUrl + "?" + new URLSearchParams(params).toString();

  console.log(`📤 请求第 ${Math.floor(offset / 50) + 1} 页: limit=${limit}, offset=${offset}`);

  // 发送 fetch 请求
  const response = await fetch(url, {
    method: "GET",
  });

  console.log(`📥 响应状态: ${response.status}`);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  const orders = data?.orders_search?.orders || [];

  console.log(`✅ 第 ${Math.floor(offset / 50) + 1} 页获取到 ${orders.length} 条订单`);

  return orders;
}

async function fetchAndExportOrders() {
  isLoading.value = true;
  orderCount.value = 0;
  exportStatus.value = "";
  exportMessage.value = "";

  try {
    // 通过 content script 获取 shopId 和 orderStates
    const { shopId: currentShopId, orderStates } =
      await getShopIdFromContentScript();

    if (!currentShopId) {
      exportStatus.value = "error";
      exportMessage.value =
        "无法获取店铺 ID，请确保在 Etsy 店铺管理页面打开此扩展，并刷新页面后重试";
      isLoading.value = false;
      return;
    }

    // 缓存 shopId
    shopId.value = currentShopId;

    const requestedLimit = formParams.value.limit;
    const MAX_LIMIT_PER_REQUEST = 50; // 服务端限制每次最多 50 条

    // 所有订单结果
    const allOrders: Order[] = [];
    let currentOffset = 0;
    let remainingLimit = requestedLimit;

    // 分页请求，直到获取到足够的订单或到达末尾
    while (remainingLimit > 0) {
      // 本次请求的 limit（最多 50）
      const currentLimit = Math.min(remainingLimit, MAX_LIMIT_PER_REQUEST);

      // 执行请求
      const orders = await fetchOrdersPage(
        currentShopId,
        currentLimit,
        currentOffset
      );

      // 将本次获取的订单添加到总结果中
      allOrders.push(...orders);

      // 如果返回的订单数量少于请求的 limit，说明已经到达末尾
      if (orders.length < currentLimit) {
        console.log(
          `⚠️ 已到达末尾，返回的订单数量 (${orders.length}) 少于请求的数量 (${currentLimit})`
        );
        break;
      }

      // 更新 offset 和剩余 limit
      currentOffset += orders.length;
      remainingLimit -= orders.length;

      // 如果已经获取到足够的订单，提前终止
      if (allOrders.length >= requestedLimit) {
        break;
      }
    }

    // 如果请求的数量超过实际数量，截取到请求的数量
    const finalOrders =
      allOrders.length > requestedLimit
        ? allOrders.slice(0, requestedLimit)
        : allOrders;

    console.log(
      `📊 总共获取到 ${finalOrders.length} 条订单（请求 ${requestedLimit} 条）`
    );

    // 更新订单数量
    orderCount.value = finalOrders.length;

    if (finalOrders.length === 0) {
      exportStatus.value = "error";
      exportMessage.value = "未获取到任何订单数据";
      return;
    }

    // 导出 CSV
    const filename = `backFillEn`;
    exportToCSV(finalOrders, filename);

    // 更新导出状态
    exportStatus.value = "success";
    exportMessage.value = `已成功导出 ${finalOrders.length} 条订单到 CSV 文件`;
  } catch (error) {
    console.error("获取订单失败:", error);
    exportStatus.value = "error";
    exportMessage.value =
      error instanceof Error ? error.message : "获取订单失败，请检查控制台";
  } finally {
    isLoading.value = false;
  }
}

// 组件挂载时自动获取订单状态
onMounted(async () => {
  try {
    const { shopId: currentShopId, orderStates } =
      await getShopIdFromContentScript();
    if (currentShopId && orderStates) {
      shopId.value = currentShopId;
      console.log("✅ 组件挂载时已获取订单状态");
    }
  } catch (error) {
    console.warn("⚠️ 组件挂载时获取订单状态失败:", error);
    // 不显示错误，因为用户可能还没有打开 Etsy 页面
  }
});
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
