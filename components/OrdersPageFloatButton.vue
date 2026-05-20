<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from "vue";
import OrderExportModal from "./OrderExportModal.vue";
import OrderImageExportModal from "./OrderImageExportModal.vue";
import { ensureSession } from "@/lib/auth-manager";

const showModal = ref(false);
const showImageExportModal = ref(false);
const targetEl = ref<HTMLElement | null>(null);
let injectedContainer: HTMLElement | null = null;

const openModal = () => {
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
};

const openImageExportModal = () => {
  showImageExportModal.value = true;
};

const closeImageExportModal = () => {
  showImageExportModal.value = false;
};

const TOOLBAR_SELECTOR =
  ".wt-mt-xs-2.wt-ml-xs-2.wt-mr-xs-2.wt-mt-md-3.wt-mm-md-3.wt-ml-md-0.wt-mr-md-0";

const MAX_WAIT_MS = 15000; // 最多等待 15 秒

function attachToToolbar(toolbar: HTMLDivElement) {
  if (injectedContainer) return;
  const container = document.createElement("div");
  container.id = "etsy-order-master-export-btn-container";
  container.className = "dropdown-group etsy-order-master-export-group";
  toolbar.appendChild(container);
  injectedContainer = container;
  targetEl.value = container;
}

let observer: MutationObserver | null = null;
let waitTimeoutId: ReturnType<typeof setTimeout> | null = null;

onMounted(() => {
  void ensureSession();

  const toolbar = document.querySelector<HTMLDivElement>(TOOLBAR_SELECTOR);

  if (toolbar) {
    attachToToolbar(toolbar);
    return;
  }

  // 工具栏由 Etsy 异步渲染，在 DOMContentLoaded 时尚未出现，用 MutationObserver 等待
  const tryFindAndAttach = () => {
    const el = document.querySelector<HTMLDivElement>(TOOLBAR_SELECTOR);
    if (el) {
      attachToToolbar(el);
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (waitTimeoutId != null) {
        clearTimeout(waitTimeoutId);
        waitTimeoutId = null;
      }
    }
  };

  observer = new MutationObserver(tryFindAndAttach);
  observer.observe(document.body, { childList: true, subtree: true });

  waitTimeoutId = setTimeout(() => {
    waitTimeoutId = null;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }, MAX_WAIT_MS);
});

onUnmounted(() => {
  if (waitTimeoutId != null) {
    clearTimeout(waitTimeoutId);
    waitTimeoutId = null;
  }
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (injectedContainer && injectedContainer.parentNode) {
    injectedContainer.parentNode.removeChild(injectedContainer);
  }
  injectedContainer = null;
  targetEl.value = null;
});
</script>

<template>
  <teleport v-if="targetEl" :to="targetEl">
    <div class="order-export-inline">
      <button type="button" class="order-export-btn" @click="openModal">
        订单管理
      </button>
      <button
        type="button"
        class="order-export-btn order-image-export-btn"
        @click="openImageExportModal"
      >
        订单图片导出
      </button>
      <OrderExportModal v-if="showModal" @close="closeModal" />
      <OrderImageExportModal
        v-if="showImageExportModal"
        @close="closeImageExportModal"
      />
    </div>
  </teleport>
</template>

<style scoped>
.order-export-inline {
  padding-left: 10px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.order-export-btn {
  padding: 8px 14px;
  font-size: 14px;
  font-weight: 500;
  color: #fff;
  background: #3b82f6;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(59, 130, 246, 0.35);
  transition: background 0.2s, transform 0.15s;
  white-space: nowrap;
}

.order-export-btn:hover {
  background: #2563eb;
  transform: translateY(-1px);
}

.order-export-btn:active {
  transform: translateY(0);
}

.order-image-export-btn {
  background: #0f766e;
  box-shadow: 0 1px 4px rgba(15, 118, 110, 0.32);
}

.order-image-export-btn:hover {
  background: #0d9488;
}
</style>
