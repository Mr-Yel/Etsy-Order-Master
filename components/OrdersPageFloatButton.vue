<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from "vue";
import OrderExportModal from "./OrderExportModal.vue";

const showModal = ref(false);
const targetEl = ref<HTMLElement | null>(null);
let injectedContainer: HTMLElement | null = null;

const openModal = () => {
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
};

onMounted(() => {
  // 找到包含 “Select Items / Update progress / More actions” 的工具条容器
  const toolbar = document.querySelector<
    HTMLDivElement
  >(
    ".wt-mt-xs-2.wt-ml-xs-2.wt-mr-xs-2.wt-mt-md-3.wt-mm-md-3.wt-ml-md-0.wt-mr-md-0"
  );

  if (!toolbar) return;

  // 在 “More actions” 所在的 dropdown-group 之后插入一个容器
  const container = document.createElement("div");
  container.id = "etsy-order-master-export-btn-container";
  container.className = "dropdown-group etsy-order-master-export-group";

  toolbar.appendChild(container);

  injectedContainer = container;
  targetEl.value = container;
});

onUnmounted(() => {
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
        订单导出
      </button>
      <OrderExportModal v-if="showModal" @close="closeModal" />
    </div>
  </teleport>
</template>

<style scoped>
.order-export-inline {
  padding-left: 10px;
  display: inline-flex;
  align-items: center;
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
</style>
