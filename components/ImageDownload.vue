<template>
  <div class="image-download">
    <!-- 上：操作按钮 -->
    <div class="toolbar toolbar-top">
      <button
        type="button"
        class="btn btn-secondary"
        :disabled="isFetching"
        @click="fetchImages"
      >
        {{ isFetching ? "获取中..." : "获取图片" }}
      </button>
      <button
        type="button"
        class="btn btn-secondary"
        :disabled="imageUrls.length === 0"
        @click="toggleSelectAll"
      >
        {{ isAllSelected ? "取消全选" : "全选" }}
      </button>
    </div>

    <!-- 订单号 -->
    <div class="order-number-section">
      <span class="order-number-label">订单号：</span>
      <span class="order-number-value">{{ orderNumber || "—" }}</span>
    </div>

    <!-- 中：图片网格 -->
    <div class="image-area">
      <div v-if="fetchError" class="message message-error">
        {{ fetchError }}
      </div>
      <div v-else-if="imageUrls.length === 0 && !isFetching" class="message message-hint">
        点击「获取图片」从当前页聊天区域收集图片链接
      </div>
      <div v-else class="image-grid">
        <div
          v-for="(url, index) in imageUrls"
          :key="index"
          :class="['image-cell', { selected: isSelected(index) }]"
          @click="toggleSelection(index)"
        >
          <img
            :src="url"
            :alt="`图片 ${index + 1}`"
            class="image-thumb"
            loading="lazy"
            @error="onImageError"
          />
          <div class="cell-checkbox">
            <span v-if="isSelected(index)" class="check-mark">✓</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 下：操作按钮 -->
    <div class="toolbar toolbar-bottom">
      <button
        type="button"
        class="btn btn-primary"
        :disabled="!hasSelection || isDownloading"
        @click="onDownload"
      >
        {{ isDownloading ? "打包中..." : `下载（已选 ${selectedIndices.length} 张）` }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";

const imageUrls = ref<string[]>([]);
const selectedIndices = ref<number[]>([]);
const isFetching = ref(false);
const isDownloading = ref(false);
const fetchError = ref("");
const orderNumber = ref<string>("");

const hasSelection = computed(() => selectedIndices.value.length > 0);

const isAllSelected = computed(() => {
  const len = imageUrls.value.length;
  if (len === 0) return false;
  return selectedIndices.value.length === len;
});

const selectedUrls = computed(() =>
  selectedIndices.value.map((i) => imageUrls.value[i]).filter(Boolean)
);

function isSelected(index: number): boolean {
  return selectedIndices.value.includes(index);
}

function toggleSelection(index: number): void {
  const arr = selectedIndices.value;
  if (arr.includes(index)) {
    selectedIndices.value = arr.filter((i) => i !== index);
  } else {
    selectedIndices.value = [...arr, index].sort((a, b) => a - b);
  }
}

function toggleSelectAll(): void {
  if (isAllSelected.value) {
    selectedIndices.value = [];
  } else {
    selectedIndices.value = imageUrls.value.map((_, i) => i);
  }
}

async function fetchImages(): Promise<void> {
  isFetching.value = true;
  fetchError.value = "";

  try {
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (tabs.length === 0 || !tabs[0].id) {
      fetchError.value = "未找到当前标签页";
      return;
    }

    const [imgResponse, orderResponse] = await Promise.all([
      browser.tabs.sendMessage(tabs[0].id, { type: "GET_MSG_LIST_IMAGES" }),
      browser.tabs.sendMessage(tabs[0].id, { type: "GET_ORDER_NUMBER" }),
    ]);

    if (imgResponse?.success && Array.isArray(imgResponse.urls)) {
      imageUrls.value = imgResponse.urls;
      selectedIndices.value = [];
    } else {
      fetchError.value = imgResponse?.error ?? "获取图片链接失败";
    }

    if (orderResponse?.success && orderResponse.orderNumber !== undefined) {
      orderNumber.value = orderResponse.orderNumber ?? "";
    } else {
      orderNumber.value = "";
    }
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "获取图片链接失败";
    fetchError.value = msg;
    if (msg.includes("Could not establish connection")) {
      fetchError.value = "请确保在 Etsy 聊天页面打开并刷新后重试";
    }
  } finally {
    isFetching.value = false;
  }
}

function base64ToBlob(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes]);
}

async function onDownload(): Promise<void> {
  const urls = selectedUrls.value;
  if (urls.length === 0) return;

  isDownloading.value = true;
  fetchError.value = "";
  try {
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tabs.length === 0 || !tabs[0].id) {
      fetchError.value = "未找到当前标签页";
      return;
    }

    const response = (await browser.tabs.sendMessage(tabs[0].id, {
      type: "DOWNLOAD_IMAGES_AS_ZIP",
      urls,
      orderNumber: orderNumber.value,
    })) as { success?: boolean; zipBase64?: string; filename?: string; error?: string };

    if (response?.success && response.zipBase64 && response.filename) {
      const blob = base64ToBlob(response.zipBase64);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = response.filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } else {
      fetchError.value = response?.error ?? "打包下载失败";
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "打包下载失败";
    fetchError.value = msg;
  } finally {
    isDownloading.value = false;
  }
}

function onImageError(e: Event): void {
  const el = e.target as HTMLImageElement;
  if (el) {
    el.style.background = "#f3f4f6";
    el.style.objectFit = "none";
  }
}
</script>

<style scoped>
.image-download {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 200px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex-shrink: 0;
}

.toolbar-top {
  margin-bottom: 4px;
}

.order-number-section {
  font-size: 12px;
  color: #6b7280;
  padding: 6px 0;
  border-bottom: 1px solid #e5e7eb;
}

.order-number-label {
  font-weight: 500;
  margin-right: 4px;
}

.order-number-value {
  color: #374151;
  font-family: ui-monospace, monospace;
}

.toolbar-bottom {
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid #e5e7eb;
}

.btn {
  padding: 6px 12px;
  font-size: 13px;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background-color 0.2s, opacity 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: #f3f4f6;
  color: #374151;
  border-color: #d1d5db;
}

.btn-secondary:hover:not(:disabled) {
  background: #e5e7eb;
}

.btn-primary {
  background: #3b82f6;
  color: white;
  width: 100%;
}

.btn-primary:hover:not(:disabled) {
  background: #2563eb;
}

.image-area {
  flex: 1;
  min-height: 160px;
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: #fafafa;
}

.message {
  padding: 16px;
  font-size: 12px;
  color: #6b7280;
  text-align: center;
}

.message-error {
  color: #991b1b;
}

.message-hint {
  color: #6b7280;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 8px;
}

.image-cell {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  max-width: 96px;
  max-height: 96px;
  margin: 0 auto;
  border-radius: 4px;
  overflow: hidden;
  border: 2px solid transparent;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.image-cell:hover {
  border-color: #93c5fd;
}

.image-cell.selected {
  border-color: #3b82f6;
  box-shadow: 0 0 0 1px #3b82f6;
}

.image-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cell-checkbox {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-cell.selected .cell-checkbox {
  background: #3b82f6;
}

.check-mark {
  color: white;
  font-size: 12px;
  font-weight: bold;
}
</style>
