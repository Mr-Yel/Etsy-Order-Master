<script lang="ts" setup>
import { computed, ref, onMounted } from "vue";
import OrderExportModal from "./OrderExportModal.vue";
import OrderImageExportModal from "./OrderImageExportModal.vue";
import { ensureSession, isLoggedIn } from "@/lib/auth-manager";
import { EOM_UI_SUFFIX, IS_TEST_BUILD } from "@/lib/runtime-identity";

const showModal = ref(false);
const showImageExportModal = ref(false);
const collapsed = ref(false);

/** 正在做登录态校验的入口（非 null 时两个入口按钮都禁用，避免重复点击） */
const pendingAction = ref<"orders" | "images" | null>(null);
/** loading 视觉延迟显示：命中会话缓存时校验几乎瞬时完成，不闪一下；超过阈值才显示「校验中」 */
const showLoading = ref(false);

const LOADING_UI_DELAY_MS = 100;

const ordersBtnLabel = computed(() =>
  pendingAction.value === "orders" && showLoading.value
    ? "校验中…"
    : `订单管理${EOM_UI_SUFFIX}`
);

const imagesBtnLabel = computed(() =>
  pendingAction.value === "images" && showLoading.value
    ? "校验中…"
    : `订单图片导出${EOM_UI_SUFFIX}`
);

const toggleCollapsed = () => {
  collapsed.value = !collapsed.value;
};

/**
 * 先校验登录态再执行 open。校验期间按钮禁用并显示 loading，避免用户以为没反应而反复点击。
 * ensureSession 命中会话缓存时不发请求，因此绝大多数点击不会有 loading 闪烁。
 */
async function withAuthGuard(
  action: "orders" | "images",
  open: () => void
): Promise<void> {
  if (pendingAction.value) return; // 已在校验中，忽略重复点击
  pendingAction.value = action;

  const timer = setTimeout(() => {
    showLoading.value = true;
  }, LOADING_UI_DELAY_MS);

  try {
    await ensureSession();
    if (!(await isLoggedIn())) return; // 未登录：ensureSession 已提示并打开登录页
    open();
  } catch (e) {
    console.error("[EOM] 登录态校验失败", e);
  } finally {
    clearTimeout(timer);
    showLoading.value = false;
    pendingAction.value = null;
  }
}

const openModal = () =>
  withAuthGuard("orders", () => {
    showModal.value = true;
  });

const openImageExportModal = () =>
  withAuthGuard("images", () => {
    showImageExportModal.value = true;
  });

const closeModal = () => {
  showModal.value = false;
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
      <button
        type="button"
        class="order-export-btn"
        :disabled="pendingAction !== null"
        :aria-busy="pendingAction === 'orders'"
        @click="openModal"
      >
        <span
          v-if="pendingAction === 'orders' && showLoading"
          class="btn-spinner"
          aria-hidden="true"
        ></span>
        {{ ordersBtnLabel }}
      </button>
      <button
        type="button"
        class="order-export-btn order-image-export-btn"
        :disabled="pendingAction !== null"
        :aria-busy="pendingAction === 'images'"
        @click="openImageExportModal"
      >
        <span
          v-if="pendingAction === 'images' && showLoading"
          class="btn-spinner"
          aria-hidden="true"
        ></span>
        {{ imagesBtnLabel }}
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

.order-export-btn:not(:disabled):hover {
  background: #2563eb;
  transform: translateY(-1px);
}

.order-export-btn:not(:disabled):active {
  transform: translateY(0);
}

/* 校验登录态期间禁用按钮，避免重复点击；此时保持原样，仅降低不透明度 */
.order-export-btn:disabled {
  opacity: 0.75;
  cursor: default;
}

.btn-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-right: 6px;
  vertical-align: -1px;
  border: 2px solid rgba(255, 255, 255, 0.45);
  border-top-color: #fff;
  border-radius: 50%;
  animation: order-export-spin 0.7s linear infinite;
}

@keyframes order-export-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .btn-spinner {
    animation-duration: 2s;
  }
}

.order-image-export-btn {
  background: #0f766e;
  box-shadow: 0 1px 4px rgba(15, 118, 110, 0.32);
}

.order-image-export-btn:not(:disabled):hover {
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
