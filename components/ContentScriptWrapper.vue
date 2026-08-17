<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from "vue";
import FileUploadWidget from "./FileUploadWidget.vue";
import OrdersPageFloatButton from "./OrdersPageFloatButton.vue";
import UspsRemoteAreaBadges from "./UspsRemoteAreaBadges.vue";

const shouldShowWidget = ref(false);
const shouldShowOrdersPageButton = ref(false);
let observer: MutationObserver | null = null;

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

onMounted(() => {
  checkElement();
  checkOrdersPage();

  observer = new MutationObserver(() => {
    checkElement();
    checkOrdersPage();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  window.addEventListener("popstate", checkOrdersPage);
});

onUnmounted(() => {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  window.removeEventListener("popstate", checkOrdersPage);
});
</script>

<template>
  <FileUploadWidget v-if="shouldShowWidget" />
  <template v-if="shouldShowOrdersPageButton">
    <OrdersPageFloatButton />
    <UspsRemoteAreaBadges />
  </template>
</template>
