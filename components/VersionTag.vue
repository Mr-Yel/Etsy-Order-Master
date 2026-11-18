<script lang="ts" setup>
import { EOM_VERSION } from "@/lib/runtime-identity";

/**
 * 统一版本号展示。所有面向用户的界面（popup / 登录页 / 各弹窗 / 页面浮窗）
 * 都引用本组件，避免各处各写一份版本文案与样式。
 */
type Props = {
  /** 字号档位：sm 用于弹窗头部、浮窗；md 用于页面级 header */
  size?: "sm" | "md";
  /** 配色：muted 用于浅色底，inverse 用于深色/彩色底 */
  tone?: "muted" | "inverse";
  /** 是否带底框，叠在彩色/深色底上时可关掉 */
  bordered?: boolean;
};

withDefaults(defineProps<Props>(), {
  size: "sm",
  tone: "muted",
  bordered: true,
});
</script>

<template>
  <span
    v-if="EOM_VERSION"
    :class="[
      'eom-version',
      `eom-version--${size}`,
      `eom-version--${tone}`,
      { 'eom-version--plain': !bordered },
    ]"
    :title="`当前插件版本 v${EOM_VERSION}`"
  >
    v{{ EOM_VERSION }}
  </span>
</template>

<style scoped>
.eom-version {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  user-select: text;
}

.eom-version--muted {
  color: #64748b;
}

.eom-version--inverse {
  color: #ffffff;
  opacity: 0.85;
}

.eom-version--sm {
  padding: 2px 6px;
  font-size: 11px;
  border-radius: 4px;
}

.eom-version--md {
  padding: 3px 8px;
  font-size: 12px;
  border-radius: 5px;
}

.eom-version--muted.eom-version--sm:not(.eom-version--plain),
.eom-version--muted.eom-version--md:not(.eom-version--plain) {
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
}

.eom-version--inverse.eom-version--sm:not(.eom-version--plain),
.eom-version--inverse.eom-version--md:not(.eom-version--plain) {
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.32);
}
</style>
