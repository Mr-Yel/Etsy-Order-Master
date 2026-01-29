<template>
  <div class="popup-container">
    <div class="header">
      <h1 class="title">Etsy Order Master</h1>
      <div class="tabs">
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
    </div>

    <div class="content">
      <OrderExport v-show="activeTab === 'order'" />
      <ImageDownload v-show="activeTab === 'image'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import OrderExport from "@/components/OrderExport.vue";
import ImageDownload from "@/components/ImageDownload.vue";

type TabId = "order" | "image";

const activeTab = ref<TabId>("order");
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
}

.title {
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  margin: 0 0 12px 0;
}

.tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid #e5e7eb;
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
</style>
