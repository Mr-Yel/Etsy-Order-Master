<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from "vue";
import FileUploadWidget from "./FileUploadWidget.vue";

const shouldShowWidget = ref(false);
let observer: MutationObserver | null = null;

const checkElement = () => {
  const targetElement = document.getElementById("mark-as-complete-overlay");
  // 根据元素是否存在来更新显示状态
  shouldShowWidget.value = targetElement !== null;
};

onMounted(() => {
  // 先立即检查一次
  checkElement();

  // 持续监听 DOM 变化，以便在元素出现和消失时都能响应
  observer = new MutationObserver(() => {
    checkElement();
  });

  // 开始观察 DOM 变化
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
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
