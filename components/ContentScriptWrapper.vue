<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from "vue";
import FileUploadWidget from "./FileUploadWidget.vue";
import OrdersPageFloatButton from "./OrdersPageFloatButton.vue";
import UspsRemoteAreaBadges from "./UspsRemoteAreaBadges.vue";

const shouldShowWidget = ref(false);
const shouldShowOrdersPageButton = ref(false);
let observer: MutationObserver | null = null;
let originalPushState: History["pushState"] | null = null;
let originalReplaceState: History["replaceState"] | null = null;

const ORDERS_SOLD_PATH = "/your/orders/sold";

const isOrdersSoldPage = () =>
  typeof window !== "undefined" &&
  (window.location.pathname === ORDERS_SOLD_PATH ||
    window.location.pathname.startsWith(`${ORDERS_SOLD_PATH}/`));

const checkElement = () => {
  const targetElement = document.getElementById("mark-as-complete-overlay");
  shouldShowWidget.value = targetElement !== null;
};

const checkOrdersPage = () => {
  const isOrdersSoldUrl = isOrdersSoldPage();
  const hasOrdersPageClass = document.querySelector(".orders-page") !== null;
  shouldShowOrdersPageButton.value = isOrdersSoldUrl || hasOrdersPageClass;
};

const refreshPageFlags = () => {
  checkElement();
  checkOrdersPage();
};

onMounted(() => {
  refreshPageFlags();

  observer = new MutationObserver(refreshPageFlags);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  window.addEventListener("popstate", refreshPageFlags);
  document.addEventListener("visibilitychange", refreshPageFlags);

  originalPushState = history.pushState;
  originalReplaceState = history.replaceState;
  history.pushState = function (...args) {
    const result = originalPushState!.apply(this, args);
    refreshPageFlags();
    return result;
  };
  history.replaceState = function (...args) {
    const result = originalReplaceState!.apply(this, args);
    refreshPageFlags();
    return result;
  };
});

onUnmounted(() => {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  window.removeEventListener("popstate", refreshPageFlags);
  document.removeEventListener("visibilitychange", refreshPageFlags);
  if (originalPushState) history.pushState = originalPushState;
  if (originalReplaceState) history.replaceState = originalReplaceState;
  originalPushState = null;
  originalReplaceState = null;
});
</script>

<template>
  <FileUploadWidget v-if="shouldShowWidget" />
  <template v-if="shouldShowOrdersPageButton">
    <OrdersPageFloatButton />
    <UspsRemoteAreaBadges />
  </template>
</template>
