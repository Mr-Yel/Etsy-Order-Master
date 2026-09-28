<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from "vue";
import OrderExportModal from "./OrderExportModal.vue";
import OrderImageExportModal from "./OrderImageExportModal.vue";
import { ensureSession } from "@/lib/auth-manager";
import {
  EOM_UI_SUFFIX,
  IS_TEST_BUILD,
  getRuntimeScopedId,
} from "@/lib/runtime-identity";

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
const CONTAINER_ID = getRuntimeScopedId("etsy-order-master-export-btn-container");

function findToolbar(): HTMLDivElement | null {
  return document.querySelector<HTMLDivElement>(TOOLBAR_SELECTOR);
}

function ensureAttached() {
  const toolbar = findToolbar();
  if (!toolbar) return;

  if (injectedContainer?.isConnected && toolbar.contains(injectedContainer)) {
    return;
  }

  const leftover = document.getElementById(CONTAINER_ID);
  if (leftover && leftover !== injectedContainer) {
    leftover.remove();
  }
  injectedContainer?.remove();

  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  container.className = "dropdown-group etsy-order-master-export-group";
  toolbar.appendChild(container);
  injectedContainer = container;
  targetEl.value = container;
}

let observer: MutationObserver | null = null;
let attachTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAttach() {
  if (attachTimer != null) clearTimeout(attachTimer);
  attachTimer = setTimeout(() => {
    attachTimer = null;
    ensureAttached();
  }, 80);
}

function onTabBecameVisible() {
  if (document.visibilityState === "visible") {
    ensureAttached();
  }
}

onMounted(() => {
  void ensureSession();
  ensureAttached();

  observer = new MutationObserver(scheduleAttach);
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener("visibilitychange", onTabBecameVisible);
  window.addEventListener("pageshow", ensureAttached);
  window.addEventListener("focus", ensureAttached);
});

onUnmounted(() => {
  if (attachTimer != null) {
    clearTimeout(attachTimer);
    attachTimer = null;
  }
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  document.removeEventListener("visibilitychange", onTabBecameVisible);
  window.removeEventListener("pageshow", ensureAttached);
  window.removeEventListener("focus", ensureAttached);
  injectedContainer?.remove();
  injectedContainer = null;
  targetEl.value = null;
});
</script>

<template>
  <teleport v-if="targetEl" :to="targetEl">
    <div :class="['order-export-inline', { 'is-test-build': IS_TEST_BUILD }]">
      <button type="button" class="order-export-btn" @click="openModal">
        订单管理{{ EOM_UI_SUFFIX }}
      </button>
      <button
        type="button"
        class="order-export-btn order-image-export-btn"
        @click="openImageExportModal"
      >
        订单图片导出{{ EOM_UI_SUFFIX }}
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

.is-test-build .order-export-btn {
  outline: 2px solid #f59e0b;
  outline-offset: 1px;
}
</style>
