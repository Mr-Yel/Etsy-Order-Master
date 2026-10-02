<script lang="ts" setup>
import { ref, onMounted } from "vue";
import OrderExportModal from "./OrderExportModal.vue";
import OrderImageExportModal from "./OrderImageExportModal.vue";
import { ensureSession, isLoggedIn } from "@/lib/auth-manager";
import { EOM_UI_SUFFIX, IS_TEST_BUILD } from "@/lib/runtime-identity";

const showModal = ref(false);
const showImageExportModal = ref(false);
const collapsed = ref(false);

const toggleCollapsed = () => {
  collapsed.value = !collapsed.value;
};

async function ensureLogin(): Promise<boolean> {
  await ensureSession();
  return await isLoggedIn();
}

const openModal = async () => {
  if (!(await ensureLogin())) return;
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
};

const openImageExportModal = async () => {
  if (!(await ensureLogin())) return;
  showImageExportModal.value = true;
};

const closeImageExportModal = () => {
  showImageExportModal.value = false;
};

onMounted(() => {
  void ensureSession();
});
</script>

<template>
  <div :class="['order-export-float', { 'is-test-build': IS_TEST_BUILD }]">
    <template v-if="!collapsed">
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
      <button
        type="button"
        class="order-export-btn order-collapse-btn"
        @click="toggleCollapsed"
      >
        收起
      </button>
    </template>
    <button
      v-else
      type="button"
      class="order-export-btn order-expand-btn"
      @click="toggleCollapsed"
    >
      展开
    </button>
    <OrderExportModal v-if="showModal" @close="closeModal" />
    <OrderImageExportModal
      v-if="showImageExportModal"
      @close="closeImageExportModal"
    />
  </div>
</template>

<style scoped>
.order-export-float {
  position: fixed;
  top: 88px;
  right: 16px;
  z-index: 999999;
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
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

.order-export-float.is-test-build {
  top: 216px;
}

.is-test-build .order-export-btn {
  outline: 2px solid #f59e0b;
  outline-offset: 1px;
}

.order-collapse-btn,
.order-expand-btn {
  background: #64748b;
  box-shadow: 0 1px 4px rgba(100, 116, 139, 0.35);
}

.order-collapse-btn:hover,
.order-expand-btn:hover {
  background: #475569;
}
</style>
