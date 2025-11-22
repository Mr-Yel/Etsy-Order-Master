<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from 'vue';
import FileUploadWidget from './FileUploadWidget.vue';

const shouldShowWidget = ref(false);
let observer: MutationObserver | null = null;

const checkElement = () => {
  const targetElement = document.getElementById('mark-as-complete-overlay');
  if (targetElement) {
    shouldShowWidget.value = true;
    // 找到后停止观察
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }
};

onMounted(() => {
  // 先立即检查一次
  checkElement();

  // 如果还没找到，使用 MutationObserver 监听
  if (!shouldShowWidget.value) {
    observer = new MutationObserver(() => {
      checkElement();
    });

    // 开始观察 DOM 变化
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // 设置超时，避免无限等待（可选，根据需求调整）
    // setTimeout(() => {
    //   if (observer) {
    //     observer.disconnect();
    //     observer = null;
    //   }
    // }, 30000); // 30 秒超时
  }
});

onUnmounted(() => {
  // 清理观察者
  if (observer) {
    observer.disconnect();
    observer = null;
  }
});
</script>

<template>
  <FileUploadWidget v-if="shouldShowWidget" />
</template>

