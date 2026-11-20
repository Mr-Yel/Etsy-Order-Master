<script setup lang="ts">
import { ref } from "vue";

const props = withDefaults(
  defineProps<{
    inputId?: string;
    placeholder?: string;
    disabled?: boolean;
    expandHeight?: number;
  }>(),
  {
    inputId: undefined,
    placeholder: "支持多个订单号，用逗号或换行分隔",
    disabled: false,
    expandHeight: 112,
  }
);

const emit = defineEmits<{
  search: [];
  clear: [];
}>();

const model = defineModel<string>({ required: true });
const active = ref(false);

function clearInput() {
  model.value = "";
  emit("clear");
}
</script>

<template>
  <div
    class="order-number-search"
    :class="{ 'is-active': active, 'is-disabled': props.disabled }"
    :style="{ '--search-expand-height': `${props.expandHeight}px` }"
  >
    <textarea
      :id="props.inputId"
      v-model="model"
      class="order-number-search__input"
      :placeholder="props.placeholder"
      :disabled="props.disabled"
      rows="1"
      spellcheck="false"
      @focus="active = true"
      @blur="active = false"
      @keydown.ctrl.enter.prevent="emit('search')"
      @keydown.meta.enter.prevent="emit('search')"
    />
    <button
      v-if="model && !props.disabled"
      type="button"
      class="order-number-search__clear"
      aria-label="清空订单号"
      title="清空"
      @mousedown.prevent
      @click="clearInput"
    >
      ×
    </button>
    <span class="order-number-search__icon" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.8-3.8" />
      </svg>
    </span>
  </div>
</template>

<style scoped>
.order-number-search {
  position: relative;
  width: 220px;
  height: 32px;
  box-sizing: border-box;
}

.order-number-search__input {
  box-sizing: border-box;
  width: 100%;
  height: 32px;
  min-height: 32px;
  max-height: 32px;
  padding: 5px 64px 5px 11px;
  color: #1f2937;
  font: inherit;
  font-size: 14px;
  line-height: 20px;
  white-space: nowrap;
  overflow: hidden;
  resize: none;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  outline: none;
  transition:
    height 0.16s ease,
    max-height 0.16s ease,
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}

.order-number-search__input::placeholder {
  color: #9ca3af;
}

.order-number-search__input:focus {
  border-color: #93b4df;
}

/* 聚焦后绝对定位展开，盖住列表但不推动弹窗布局 */
.order-number-search.is-active .order-number-search__input {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 50;
  height: var(--search-expand-height, 112px);
  max-height: var(--search-expand-height, 112px);
  white-space: pre-wrap;
  overflow-y: auto;
  box-shadow: 0 8px 24px rgb(31 45 61 / 18%);
}

.order-number-search__icon {
  position: absolute;
  top: 1px;
  right: 1px;
  z-index: 51;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  color: #9ca3af;
  pointer-events: none;
  background: #fff;
}

.order-number-search__clear {
  position: absolute;
  top: 1px;
  right: 31px;
  z-index: 52;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 30px;
  padding: 0;
  color: #9ca3af;
  font-size: 19px;
  line-height: 1;
  background: #fff;
  border: 0;
  cursor: pointer;
}

.order-number-search__clear:hover {
  color: #4b5563;
}

.order-number-search.is-disabled {
  opacity: 0.7;
}

.order-number-search__input:disabled {
  cursor: not-allowed;
  background: #f3f4f6;
}
</style>
