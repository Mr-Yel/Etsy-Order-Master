<script lang="ts" setup>
import { onMounted, onUnmounted, reactive, ref } from "vue";
import Papa from "papaparse";
import {
  annotateOrderRows,
  fillCarrierNamesBatch,
  fillOrdersBatch,
  nextPaint,
  scanOrderRows,
  updateOrderCountLabel,
  waitForCarrierNameInputs,
} from "@/utils/dom-utils";
import type { OrderRowIssue } from "@/utils/dom-utils";
import { downloadCSVTemplate } from "@/utils/csv-utils";
import VersionTag from "@/components/VersionTag.vue";
import {
  IS_TEST_BUILD,
  getRuntimeScopedId,
} from "@/lib/runtime-identity";

// 订单数据类型定义
type OrderData = {
  orderNumber: string;
  trackingNumber: string;
  shippingCarrier: string;
};

const isOpen = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const fileContent = ref<string>("");
const parseError = ref<string>("");
const parsedData = ref<OrderData[]>([]);
const isProcessing = ref(false);
/** 当前处理阶段文案 */
const processStage = ref("");
const processedCount = ref(0);
/** 承运商命中已有选项的订单 */
const matchedOrders = ref<string[]>([]);
/** 承运商匹配不到、回落 Other 并填入名称的订单 */
const fallbackOrders = ref<{ orderNumber: string; carrier: string }[]>([]);
/** 未写入的订单及原因 */
const failedOrders = ref<{ orderNumber: string; reason: string }[]>([]);
const matchCount = ref(0);
/** 页面表单里有、但 CSV 表格里没有的订单号 */
const pageOnlyOrders = ref<string[]>([]);
/** 页面扫描到的订单总数；-1 表示未扫描或扫描失败 */
const pageScannedCount = ref(-1);
const fileInputId = getRuntimeScopedId("file-upload-input");
const runtimeOwner = IS_TEST_BUILD ? "test" : "production";

/** 各分组的展开状态：默认全部收缩 */
const expanded = reactive({
  pageOnly: false,
  matched: false,
  fallback: false,
  failed: false,
});

const toggleSection = (key: keyof typeof expanded) => {
  expanded[key] = !expanded[key];
};

/** 重置分组展开状态（每次重新导入都回到收缩） */
const resetSections = () => {
  expanded.pageOnly = false;
  expanded.matched = false;
  expanded.fallback = false;
  expanded.failed = false;
};

/** 把当前结果映射到页面对应订单卡片；重复订单会合并所有异常原因 */
const collectOrderRowIssues = (): OrderRowIssue[] => {
  const issueMap = new Map<string, string[]>();
  const addIssue = (orderNumber: string, reason: string) => {
    const normalizedOrderNumber = orderNumber.trim();
    const normalizedReason = reason.trim();
    if (!normalizedOrderNumber || !normalizedReason) return;

    const reasons = issueMap.get(normalizedOrderNumber) ?? [];
    if (!reasons.includes(normalizedReason)) {
      reasons.push(normalizedReason);
      issueMap.set(normalizedOrderNumber, reasons);
    }
  };

  pageOnlyOrders.value.forEach((orderNumber) => {
    addIssue(orderNumber, "上传表格中未找到该订单号");
  });
  failedOrders.value.forEach((item) => {
    addIssue(item.orderNumber, item.reason);
  });

  return Array.from(issueMap, ([orderNumber, reasons]) => ({
    orderNumber,
    reason: reasons.join("；"),
  }));
};

const refreshOrderRowAnnotations = () => {
  try {
    const result = annotateOrderRows(collectOrderRowIssues());
    updateOrderCountLabel({
      total: result.annotated,
      filled: matchCount.value,
      owner: runtimeOwner,
      claim: isProcessing.value || parsedData.value.length > 0,
    });
    console.info(
      `[EOM] 页面订单标注：识别 ${result.annotated} 行，标红 ${result.marked} 行`
    );
    if (result.missingOrderNumbers.length > 0) {
      console.warn(
        `⚠️ 以下异常订单未找到对应页面表单，无法标红:`,
        result.missingOrderNumbers
      );
    }
  } catch (error) {
    console.warn("⚠️ 更新页面订单行标记失败:", error);
  }
};

let annotationObserver: MutationObserver | null = null;
let annotationTimer: number | null = null;
const ORDER_NUMBER_LABEL_CLASS = "eom-order-number-label";
const ORDER_COUNT_LABEL_CLASS = "eom-order-count-label";
const ORDER_ERROR_REASON_CLASS = getRuntimeScopedId(
  "eom-order-row-error-reason"
);

const isOwnAnnotationNode = (node: Node): boolean => {
  if (!(node instanceof Element)) return false;
  return (
    node.classList.contains(ORDER_NUMBER_LABEL_CLASS) ||
    node.classList.contains(ORDER_COUNT_LABEL_CLASS) ||
    node.classList.contains(ORDER_ERROR_REASON_CLASS)
  );
};

const hasExternalDomMutation = (records: MutationRecord[]): boolean =>
  records.some(
    (record) =>
      Array.from(record.addedNodes).some(
        (node) => !isOwnAnnotationNode(node)
      ) ||
      Array.from(record.removedNodes).some(
        (node) => !isOwnAnnotationNode(node)
      )
  );

/** DOM 变化通常是一组连续提交，合并到下一轮再标注 */
const scheduleOrderRowAnnotations = (delayMs = 80) => {
  if (annotationTimer !== null) {
    window.clearTimeout(annotationTimer);
  }
  annotationTimer = window.setTimeout(() => {
    annotationTimer = null;
    refreshOrderRowAnnotations();
  }, delayMs);
};

onMounted(() => {
  // 表单页出现时先立即尝试，再继续监听 Etsy 后续渲染出的订单卡片
  scheduleOrderRowAnnotations(0);
  const annotationRoot =
    document.getElementById("mark-as-complete-overlay") ?? document.body;
  annotationObserver = new MutationObserver((records) => {
    if (!isProcessing.value && hasExternalDomMutation(records)) {
      scheduleOrderRowAnnotations();
    }
  });
  annotationObserver.observe(annotationRoot, {
    childList: true,
    subtree: true,
  });
});

onUnmounted(() => {
  annotationObserver?.disconnect();
  annotationObserver = null;
  if (annotationTimer !== null) {
    window.clearTimeout(annotationTimer);
    annotationTimer = null;
  }
});

const togglePanel = () => {
  isOpen.value = !isOpen.value;
};

const handleFileSelect = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (!file) return;

  // 验证文件类型
  const fileName = file.name.toLowerCase();
  if (!fileName.endsWith(".csv")) {
    parseError.value = "只能上传 CSV 文件！";
    selectedFile.value = null;
    fileContent.value = "";
    parsedData.value = [];
    console.error("❌ 文件类型错误：只能上传 CSV 文件");
    return;
  }

  selectedFile.value = file;
  parseError.value = "";
  parsedData.value = [];

  // 读取文件内容
  const reader = new FileReader();
  reader.onload = (e) => {
    let text = e.target?.result as string;

    // 移除 UTF-8 BOM（如果存在）
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }

    fileContent.value = text;

    // 解析 CSV
    parseCSV(text);
  };
  reader.readAsText(file, "UTF-8");
};

const parseCSV = (csvText: string) => {
  try {
    // 使用 PapaParse 解析 CSV（不使用表头，直接解析为数组）
    Papa.parse(csvText, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          parseError.value = `CSV 解析错误: ${results.errors[0].message}`;
          console.error("❌ CSV 解析错误:", results.errors);
          return;
        }

        const rawData = results.data as string[][];

        if (rawData.length === 0) {
          parseError.value = "CSV 文件为空或没有数据行";
          console.warn("⚠️ CSV 文件为空");
          return;
        }

        // 跳过第一行（表头），从第二行开始处理数据
        const dataRows = rawData.slice(1);

        if (dataRows.length === 0) {
          parseError.value = "CSV 文件只有表头，没有数据行";
          console.warn("⚠️ CSV 文件只有表头");
          return;
        }

        // 按列索引提取数据并组成对象数组
        // 第一列：orderNumber，第二列：trackingNumber，第三列：shippingCarrier
        const orderData = dataRows.map((row: string[], index: number) => {
          const orderNumber = (row[0] || "").trim();
          const trackingNumber = (row[1] || "").trim();
          const shippingCarrier = (row[2] || "").trim();

          return {
            orderNumber,
            trackingNumber,
            shippingCarrier,
          };
        });

        // 保存解析后的数据
        parsedData.value = orderData;

        // 打印对象数组到控制台
        console.log("=".repeat(60));
        console.log("✅ CSV 解析成功！");
        console.log("=".repeat(60));
        console.log(`📈 数据行数: ${orderData.length}`);
        console.log("\n📋 解析后的对象数组:");
        console.log(orderData);
        console.log("\n📋 表格形式显示:");
        console.table(orderData);

        // 开始填充表单
        fillFormFields(orderData);
      },
      error: (error: Error) => {
        parseError.value = `CSV 解析失败: ${error.message}`;
        console.error("❌ CSV 解析失败:", error);
      },
    });
  } catch (error) {
    parseError.value = `解析 CSV 时发生错误: ${
      error instanceof Error ? error.message : "未知错误"
    }`;
    console.error("❌ 解析 CSV 时发生错误:", error);
  }
};

/**
 * 一批写入多少单：同批在主世界一个同步块内完成，Etsy 的 React 会把多次
 * setState 合并成一次渲染，批越大越快，但单次长任务也越久。
 */
const BATCH_SIZE = 8;
/** 选中 Other 后等承运商名称输入框渲染的最长等待 */
const CARRIER_NAME_WAIT_MS = 4000;

/**
 * 按 CSV 顺序分批回填。
 * 流程：扫描页面 → 分批写「运单号 + 承运商」→ 等 Other 输入框渲染 → 分批写「承运商名称」。
 * 承运商名称后置是关键：避免每单都空等输入框出现，把 N 次等待合并成 1 次。
 */
const fillFormFields = async (orderData: OrderData[]) => {
  isProcessing.value = true;
  processStage.value = "正在扫描订单行...";
  processedCount.value = 0;
  matchedOrders.value = [];
  fallbackOrders.value = [];
  failedOrders.value = [];
  pageOnlyOrders.value = [];
  pageScannedCount.value = -1;
  matchCount.value = 0;
  resetSections();
  refreshOrderRowAnnotations();

  const startedAt = Date.now();

  console.log("\n" + "=".repeat(60));
  console.log("🚀 开始填充表单字段...");
  console.log("=".repeat(60));

  // 1) 先分离明显的无效行，再扫描页面，提前剔除页面上不存在的订单
  const candidates: OrderData[] = [];
  for (const order of orderData) {
    if (!order.orderNumber) {
      failedOrders.value.push({ orderNumber: "(空)", reason: "缺少订单号" });
      continue;
    }
    if (!order.trackingNumber && !order.shippingCarrier) {
      failedOrders.value.push({
        orderNumber: order.orderNumber,
        reason: "运单号与承运商都为空",
      });
      continue;
    }
    candidates.push(order);
  }

  const scan = await scanOrderRows();
  const onPage = new Set(scan?.orderNumbers ?? []);
  const scanned = Boolean(scan);
  if (scanned) {
    console.log(
      `🔍 扫描到页面订单行 ${onPage.size} 个（运单号输入框 ${scan?.trackingOrderNumbers.length ?? 0} 个）`
    );

    // 页面表单里有、表格里没有的订单：用来发现 CSV 漏单
    const csvOrderNumbers = new Set(
      orderData.map((order) => order.orderNumber).filter(Boolean)
    );
    pageScannedCount.value = onPage.size;
    pageOnlyOrders.value = Array.from(onPage)
      .filter((orderNumber) => !csvOrderNumbers.has(orderNumber))
      .sort();
    if (pageOnlyOrders.value.length > 0) {
      console.warn(
        `⚠️ 表单存在但表格未找到 ${pageOnlyOrders.value.length} 单:`,
        pageOnlyOrders.value
      );
      // 表单页订单与上传表格完全不重合时，也应立即标出这些页面订单
      await nextPaint();
      refreshOrderRowAnnotations();
    }
  }

  // 扫描不到的订单排到最后再试：可能页面还没渲染完，不直接判失败
  const onPageTargets: OrderData[] = [];
  const offPageTargets: OrderData[] = [];
  for (const order of candidates) {
    if (scanned && !onPage.has(order.orderNumber)) {
      offPageTargets.push(order);
    } else {
      onPageTargets.push(order);
    }
  }
  if (offPageTargets.length > 0) {
    console.log(`⚠️ 扫描未命中 ${offPageTargets.length} 个订单，排到最后再尝试`);
  }
  const targets = [...onPageTargets, ...offPageTargets];

  let handledCount = failedOrders.value.length;
  processedCount.value = handledCount;

  /** 需要第二阶段补写承运商名称的订单 */
  const pendingCarrierNames: { orderNumber: string; carrierName: string }[] = [];

  // 2) 分批写运单号 + 承运商
  processStage.value = "正在写入运单号与承运商...";

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const chunk = targets.slice(i, i + BATCH_SIZE);

    const batchResult = await fillOrdersBatch({
      orders: chunk.map((order) => ({
        orderNumber: order.orderNumber,
        trackingNumber: order.trackingNumber || undefined,
        carrierText: order.shippingCarrier || undefined,
      })),
    });

    const resultMap = new Map(
      (batchResult?.results ?? []).map((item) => [item.orderNumber, item])
    );

    for (const order of chunk) {
      const orderNumber = order.orderNumber;
      const item = resultMap.get(orderNumber);
      let failedReason: string | null = null;

      if (!item) {
        failedReason = batchResult ? "该批次未返回结果" : "批量写入请求失败";
      } else if (item.tracking && !item.tracking.ok) {
        failedReason = `运单号未写入（${item.tracking.reason ?? "未知原因"}${
          item.tracking.readback ? `，回读为 "${item.tracking.readback}"` : ""
        }）`;
      } else if (item.carrier && !item.carrier.ok) {
        failedReason = `承运商未写入（${item.carrier.reason ?? "未知原因"}）`;
      }

      if (failedReason) {
        failedOrders.value.push({ orderNumber, reason: failedReason });
      } else if (item?.carrier?.fallbackToOther) {
        pendingCarrierNames.push({
          orderNumber,
          carrierName: order.shippingCarrier,
        });
      } else {
        matchedOrders.value.push(orderNumber);
        console.log(`✅ 订单 ${orderNumber} 填充成功`);
      }

      handledCount += 1;
    }

    processedCount.value = handledCount;
    await nextPaint();
  }

  // 3) 等承运商名称输入框渲染（只等一次，不是每单都等）
  if (pendingCarrierNames.length > 0) {
    processStage.value = "等待承运商名称输入框渲染...";
    const wait = await waitForCarrierNameInputs(
      pendingCarrierNames.map((item) => item.orderNumber),
      { timeoutMs: CARRIER_NAME_WAIT_MS }
    );
    console.log(
      `⌛ 等待承运商名称输入框：${wait.elapsedMs}ms，未就绪 ${wait.missing.length} 个`
    );

    // 4) 分批补写承运商名称
    processStage.value = "正在写入承运商名称...";

    for (let i = 0; i < pendingCarrierNames.length; i += BATCH_SIZE) {
      const chunk = pendingCarrierNames.slice(i, i + BATCH_SIZE);

      const batchResult = await fillCarrierNamesBatch({ items: chunk });
      const resultMap = new Map(
        (batchResult?.results ?? []).map((item) => [item.orderNumber, item])
      );

      for (const entry of chunk) {
        const item = resultMap.get(entry.orderNumber);

        if (!item || !item.ok) {
          failedOrders.value.push({
            orderNumber: entry.orderNumber,
            reason: `承运商名称未写入（${
              item?.reason ?? (batchResult ? "该批次未返回结果" : "批量写入请求失败")
            }）`,
          });
          continue;
        }

        fallbackOrders.value.push({
          orderNumber: entry.orderNumber,
          carrier: entry.carrierName,
        });
        console.log(
          `🟡 订单 ${entry.orderNumber}：承运商「${entry.carrierName}」无匹配项，已选 Other 并填入名称`
        );
      }

      await nextPaint();
    }
  }

  matchCount.value = matchedOrders.value.length + fallbackOrders.value.length;
  await nextPaint();
  refreshOrderRowAnnotations();
  isProcessing.value = false;
  processStage.value = "";

  console.log("\n" + "=".repeat(60));
  console.log(`✅ 表单填充完成！耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  console.log(`📊 已填写: ${matchCount.value}/${orderData.length} 个订单`);
  console.log(`   · 承运商命中: ${matchedOrders.value.length}`);
  console.log(`   · 回落 Other: ${fallbackOrders.value.length}`);
  console.log(`   · 未填写: ${failedOrders.value.length}`);
  if (fallbackOrders.value.length > 0) {
    console.log("🟡 回落 Other 的订单:", fallbackOrders.value);
  }
  if (failedOrders.value.length > 0) {
    console.warn("❌ 未填写的订单:", failedOrders.value);
  }
  console.log("=".repeat(60));
};

const clearFile = () => {
  selectedFile.value = null;
  fileContent.value = "";
  parseError.value = "";
  parsedData.value = [];
  matchedOrders.value = [];
  fallbackOrders.value = [];
  failedOrders.value = [];
  pageOnlyOrders.value = [];
  pageScannedCount.value = -1;
  matchCount.value = 0;
  processedCount.value = 0;
  isProcessing.value = false;
  processStage.value = "";
  resetSections();
  refreshOrderRowAnnotations();
  if (fileInputRef.value) {
    fileInputRef.value.value = "";
  }
};

const handleDownloadTemplate = () => {
  try {
    downloadCSVTemplate("backFillEn");
    console.log("✅ CSV 模板下载成功");
  } catch (error) {
    console.error("❌ CSV 模板下载失败:", error);
  }
};
</script>

<template>
  <div
    class="file-upload-widget"
    :class="{ 'file-upload-widget--test': IS_TEST_BUILD }"
  >
    <!-- 右下角按钮 -->
    <button
      class="toggle-button"
      @click="togglePanel"
      :class="{ active: isOpen }"
      :title="IS_TEST_BUILD ? '打开文件上传（测试）' : '打开文件上传'"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="17 8 12 3 7 8"></polyline>
        <line x1="12" y1="3" x2="12" y2="15"></line>
      </svg>
      <span v-if="IS_TEST_BUILD" class="toggle-runtime-badge">测试</span>
    </button>

    <!-- 浮窗面板 -->
    <div v-if="isOpen" class="upload-panel">
      <div class="panel-header">
        <div class="header-left">
          <h3>
            文件上传
            <span v-if="IS_TEST_BUILD" class="header-runtime-badge">测试</span>
          </h3>
          <VersionTag size="sm" tone="inverse" />
          <button
            class="download-template-button-icon"
            @click="handleDownloadTemplate"
            title="下载 CSV 模板文件"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
        </div>
        <button class="close-button" @click="togglePanel" title="关闭">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="panel-content">
        <div class="upload-area">
          <input
            ref="fileInputRef"
            type="file"
            :id="fileInputId"
            accept=".csv"
            @change="handleFileSelect"
            class="file-input"
          />
          <label :for="fileInputId" class="upload-label">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <span>点击选择 CSV 文件</span>
          </label>
        </div>

        <!-- 错误提示 -->
        <div v-if="parseError" class="error-message">
          <strong>❌ 错误：</strong>
          <span>{{ parseError }}</span>
        </div>

        <!-- 处理中提示 -->
        <div v-if="isProcessing" class="processing-message">
          <strong>⏳ {{ processStage || "正在填充表单..." }}</strong>
          <span>
            已处理 {{ processedCount }} / {{ parsedData.length }} 个订单
          </span>
        </div>

        <!-- 填写结果 -->
        <div
          v-if="!isProcessing && parsedData.length > 0 && !parseError"
          :class="[
            'match-result',
            matchCount === 0 ? 'match-result-empty' : '',
            failedOrders.length > 0 ? 'match-result-has-failed' : ''
          ]"
        >
          <div class="match-header">
            <strong v-if="matchCount > 0">✅ 已填写 {{ matchCount }} 个订单</strong>
            <strong v-else>⚠️ 没有订单被填写</strong>
            <button class="clear-button" @click="clearFile" title="清除">
              ×
            </button>
          </div>
          <div class="match-count">
            <template v-if="matchCount > 0">
              <span class="total-count">共 {{ parsedData.length }} 个订单</span>
            </template>
            <template v-else>
              未填写任何订单
              <span class="total-count">（共 {{ parsedData.length }} 个订单）</span>
            </template>
          </div>

          <!-- 表单存在但表格未找到：始终展示，便于确认有没有漏单 -->
          <div class="match-section">
            <button
              type="button"
              class="section-toggle"
              :class="{ 'section-toggle-static': pageOnlyOrders.length === 0 }"
              @click="pageOnlyOrders.length > 0 && toggleSection('pageOnly')"
            >
              <span class="section-title">表单存在但表格未找到</span>
              <span v-if="pageOnlyOrders.length > 0" class="section-count">
                {{ pageOnlyOrders.length }}
              </span>
              <span
                v-if="pageOnlyOrders.length > 0"
                class="section-caret"
                :class="{ open: expanded.pageOnly }"
                >▸</span
              >
              <span v-else class="section-ok">✓ 全都找到了</span>
            </button>
            <div v-if="pageOnlyOrders.length === 0" class="section-empty">
              <template v-if="pageScannedCount >= 0">
                页面扫描到 {{ pageScannedCount }} 个订单，表格里的订单全部命中
              </template>
              <template v-else>未扫描到页面订单行</template>
            </div>
            <div v-else-if="expanded.pageOnly" class="orders-list section-badges">
              <span
                v-for="orderNumber in pageOnlyOrders"
                :key="orderNumber"
                class="order-badge order-badge-neutral"
              >
                {{ orderNumber }}
              </span>
            </div>
          </div>

          <div v-if="matchedOrders.length > 0" class="match-section">
            <button
              type="button"
              class="section-toggle"
              @click="toggleSection('matched')"
            >
              <span class="section-title">承运商命中已有选项</span>
              <span class="section-count">{{ matchedOrders.length }}</span>
              <span class="section-caret" :class="{ open: expanded.matched }"
                >▸</span
              >
            </button>
            <div v-if="expanded.matched" class="orders-list section-badges">
              <span
                v-for="orderNumber in matchedOrders"
                :key="orderNumber"
                class="order-badge"
              >
                {{ orderNumber }}
              </span>
            </div>
          </div>

          <div v-if="fallbackOrders.length > 0" class="match-section">
            <button
              type="button"
              class="section-toggle"
              @click="toggleSection('fallback')"
            >
              <span class="section-title section-title-warn"
                >匹配不到承运商，已选 Other 并填入名称</span
              >
              <span class="section-count section-count-warn">
                {{ fallbackOrders.length }}
              </span>
              <span class="section-caret" :class="{ open: expanded.fallback }"
                >▸</span
              >
            </button>
            <div v-if="expanded.fallback" class="orders-list section-badges">
              <span
                v-for="item in fallbackOrders"
                :key="item.orderNumber"
                class="order-badge order-badge-warn"
              >
                {{ item.orderNumber }} · {{ item.carrier }}
              </span>
            </div>
          </div>

          <div v-if="failedOrders.length > 0" class="match-section">
            <button
              type="button"
              class="section-toggle"
              @click="toggleSection('failed')"
            >
              <span class="section-title section-title-error"
                >未填写（{{ failedOrders.length }} 个）</span
              >
              <span class="section-count section-count-error">
                {{ failedOrders.length }}
              </span>
              <span class="section-caret" :class="{ open: expanded.failed }"
                >▸</span
              >
            </button>
            <ul v-if="expanded.failed" class="failed-list">
              <li v-for="item in failedOrders" :key="item.orderNumber">
                <strong>{{ item.orderNumber }}</strong
                >：{{ item.reason }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-upload-widget {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 999999;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
}

.file-upload-widget--test {
  right: 92px;
}

.toggle-button {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transition: all 0.3s ease;
  position: relative;
}

.toggle-button:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
}

.toggle-button.active {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.file-upload-widget--test .toggle-button {
  background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%);
}

.file-upload-widget--test .toggle-button.active {
  background: linear-gradient(135deg, #f97316 0%, #dc2626 100%);
}

.toggle-runtime-badge {
  position: absolute;
  top: -7px;
  right: -10px;
  padding: 2px 6px;
  border: 1px solid #fff;
  border-radius: 9px;
  background: #dc2626;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.3;
  box-shadow: 0 2px 5px rgba(15, 23, 42, 0.25);
}

.upload-panel {
  position: absolute;
  bottom: 70px;
  right: 0;
  width: 400px;
  max-height: 600px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.panel-header h3 {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 18px;
  font-weight: 600;
}

.file-upload-widget--test .panel-header {
  background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%);
}

.header-runtime-badge {
  padding: 2px 6px;
  border: 1px solid rgba(255, 255, 255, 0.65);
  border-radius: 4px;
  background: rgba(127, 29, 29, 0.32);
  font-size: 10px;
  font-weight: 700;
  line-height: 1.35;
}

.close-button {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: white;
  transition: background 0.2s ease;
}

.close-button:hover {
  background: rgba(255, 255, 255, 0.3);
}

.download-template-button-icon {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: white;
  transition: background 0.2s ease;
}

.download-template-button-icon:hover {
  background: rgba(255, 255, 255, 0.3);
}

.panel-content {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.upload-area {
  margin-bottom: 20px;
}

.file-input {
  display: none;
}

.upload-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  border: 2px dashed #cbd5e0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  color: #718096;
}

.upload-label:hover {
  border-color: #667eea;
  background: #f7fafc;
  color: #667eea;
}

.upload-label svg {
  margin-bottom: 12px;
}

.upload-label span {
  font-size: 14px;
  font-weight: 500;
}

.file-info {
  background: #f7fafc;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.file-name {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.file-name strong {
  color: #2d3748;
}

.file-name span {
  color: #4a5568;
  flex: 1;
  word-break: break-all;
}

.clear-button {
  background: #e53e3e;
  color: white;
  border: none;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  transition: background 0.2s ease;
}

.clear-button:hover {
  background: #c53030;
}

.file-size,
.file-type {
  margin-top: 8px;
  font-size: 14px;
  color: #4a5568;
}

.file-size strong,
.file-type strong {
  color: #2d3748;
  margin-right: 8px;
}

.error-message {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
  color: #991b1b;
  font-size: 14px;
}

.error-message strong {
  color: #dc2626;
  display: block;
  margin-bottom: 4px;
}

.success-message {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
  color: #166534;
  font-size: 14px;
}

.success-message strong {
  color: #16a34a;
  display: block;
  margin-bottom: 4px;
}

.processing-message {
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
  color: #92400e;
  font-size: 14px;
  text-align: center;
}

.processing-message strong {
  color: #d97706;
  display: block;
  margin-bottom: 4px;
}

.match-result {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  color: #166534;
  font-size: 14px;
}

.match-result-empty {
  background: #fef3c7;
  border: 1px solid #fde68a;
  color: #92400e;
}

.match-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.match-header strong {
  color: #16a34a;
  font-size: 16px;
}

.match-result-empty .match-header strong {
  color: #d97706;
}

.match-count {
  margin-bottom: 12px;
  font-size: 14px;
}

.match-count strong {
  color: #16a34a;
  font-size: 18px;
}

.match-result-empty .match-count strong {
  color: #d97706;
}

.total-count {
  color: #4b5563;
  font-size: 12px;
}

/* 可收展的分组 */
.match-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #d1d5db;
}

.section-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 2px 0;
  background: transparent;
  border: none;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  color: #166534;
  text-align: left;
  cursor: pointer;
}

.section-toggle:hover {
  opacity: 0.75;
}

.section-toggle-static {
  cursor: default;
}

.section-toggle-static:hover {
  opacity: 1;
}

.section-title-warn {
  color: #b45309;
}

.section-title-error {
  color: #b91c1c;
}

.section-toggle .section-title {
  flex: 0 1 auto;
  min-width: 0;
}

.section-count {
  flex: 0 0 auto;
  min-width: 20px;
  padding: 1px 8px;
  border-radius: 10px;
  background: #e5e7eb;
  color: #374151;
  font-size: 12px;
  font-weight: 500;
  text-align: center;
}

.section-count-warn {
  background: #fef3c7;
  color: #b45309;
}

.section-count-error {
  background: #fee2e2;
  color: #b91c1c;
}

.section-caret {
  margin-left: auto;
  font-size: 12px;
  line-height: 1;
  color: #6b7280;
  transition: transform 0.15s ease;
}

.section-caret.open {
  transform: rotate(90deg);
}

.section-ok {
  margin-left: auto;
  font-size: 12px;
  font-weight: 500;
  color: #16a34a;
}

.section-empty {
  margin-top: 6px;
  font-size: 12px;
  color: #6b7280;
}

.section-badges {
  margin-top: 8px;
}

.orders-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.order-badge {
  background: #dcfce7;
  color: #166534;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid #bbf7d0;
}

.order-badge-warn {
  background: #fef3c7;
  color: #92400e;
  border-color: #fde68a;
}

.order-badge-neutral {
  background: #f3f4f6;
  color: #374151;
  border-color: #e5e7eb;
}

.match-result-has-failed {
  border-color: #fecaca;
}

.failed-list {
  margin: 8px 0 0;
  padding-left: 18px;
  color: #b91c1c;
  font-size: 12px;
  line-height: 1.7;
  max-height: 140px;
  overflow-y: auto;
}

.failed-list strong {
  font-weight: 600;
  color: #7f1d1d;
}

.file-content {
  background: #1a202c;
  border-radius: 8px;
  padding: 16px;
  max-height: 300px;
  overflow-y: auto;
}

.content-header {
  color: #e2e8f0;
  margin-bottom: 12px;
  font-size: 14px;
}

.content-preview {
  color: #a0aec0;
  font-size: 12px;
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: "Courier New", monospace;
}

/* 滚动条样式 */
.panel-content::-webkit-scrollbar,
.file-content::-webkit-scrollbar {
  width: 6px;
}

.panel-content::-webkit-scrollbar-track,
.file-content::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.panel-content::-webkit-scrollbar-thumb,
.file-content::-webkit-scrollbar-thumb {
  background: #cbd5e0;
  border-radius: 3px;
}

.panel-content::-webkit-scrollbar-thumb:hover,
.file-content::-webkit-scrollbar-thumb:hover {
  background: #a0aec0;
}
</style>
