<template>
  <div class="popup-container">
    <div class="header">
      <div class="header-left">
        <h1 class="title">Etsy Order Master</h1>
        <p v-if="shopId != null" class="shop-id">
          当前店铺 ID：{{ shopId }}
        </p>
      </div>
      <button class="login-link" type="button" @click="openLoginPage">
        {{ isLoggedIn ? "账号管理" : "去登录" }}
      </button>
    </div>

    <div v-if="isLoggedIn" class="tabs">
      <button
        type="button"
        :class="['tab', { active: activeTab === 'order' }]"
        @click="activeTab = 'order'"
      >
        订单导出
      </button>
      <button
        type="button"
        :class="['tab', { active: activeTab === 'image' }]"
        @click="activeTab = 'image'"
      >
        图片下载
      </button>
    </div>

    <div class="content">
      <div v-if="!isLoggedIn" class="login-hint">
        <h2 class="login-hint-title">请登录后使用插件</h2>
      </div>

      <template v-else>
        <OrderExport v-show="activeTab === 'order'" />
        <ImageDownload v-show="activeTab === 'image'" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import OrderExport from "@/components/OrderExport.vue";
import ImageDownload from "@/components/ImageDownload.vue";
import { getEtsyContextFromActiveTab } from "@/lib/etsy-tab-client";
import { useAuth } from "@/composables/useAuth";

type TabId = "order" | "image";

const { isLoggedIn, openLoginPage } = useAuth();
const activeTab = ref<TabId>("order");
const shopId = ref<number | null>(null);

const loadShopId = async () => {
  try {
    const response = await getEtsyContextFromActiveTab();
    if (typeof response.shopId === "number") {
      shopId.value = response.shopId;
    }
  } catch (error) {
    // 静默失败：在非 Etsy 页面或 content 未注入时不展示店铺 ID
    console.warn("获取店铺 ID 失败:", error);
  }
};

onMounted(() => {
  void loadShopId();
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
  padding-bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-left {
  display: flex;
  flex-direction: column;
}

.title {
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
}

.shop-id {
  margin: 4px 0 12px;
  font-size: 11px;
  color: #6b7280;
}

.tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid #e5e7eb;
}

.login-link {
  margin-left: 8px;
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 9999px;
  border: 1px solid #d1d5db;
  background: #f9fafb;
  color: #4b5563;
  cursor: pointer;
  white-space: nowrap;
}

.login-link:hover {
  background: #f3f4f6;
}

.tab {
  flex: 1;
  padding: 10px 12px;
  font-size: 13px;
  color: #6b7280;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
}

.tab:hover {
  color: #374151;
}

.tab.active {
  color: #3b82f6;
  font-weight: 500;
  border-bottom-color: #3b82f6;
}

.content {
  padding: 12px;
}

.login-hint {
  padding: 16px 12px 20px;
  border-radius: 10px;
  background: #f9fafb;
  border: 1px dashed #d1d5db;
  text-align: left;
}

.login-hint-title {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 600;
  color: #111827;
}

.login-hint-desc {
  margin: 0 0 12px;
  font-size: 13px;
  color: #6b7280;
}

.login-hint-button {
  padding: 6px 10px;
  font-size: 13px;
  border-radius: 9999px;
  border: none;
  background: #3b82f6;
  color: #ffffff;
  cursor: pointer;
}

.login-hint-button:hover {
  background: #2563eb;
}
</style>
