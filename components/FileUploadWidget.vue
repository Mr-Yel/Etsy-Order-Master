<script lang="ts" setup>
import { ref } from "vue";
import Papa from "papaparse";
import {
  changeSelectOption,
  changeInputValue,
} from "@/utils/dom-utils";

// 订单数据类型定义
type OrderData = {
  orderNumber: string;
  trackingNumber: string;
  shippingCarrier: string;
};

const isOpen = ref(false);
const selectedFile = ref<File | null>(null);
const fileContent = ref<string>("");
const parseError = ref<string>("");
const parsedData = ref<OrderData[]>([]);
const isProcessing = ref(false);
const matchedOrders = ref<string[]>([]);
const matchCount = ref(0);

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
 * 填充表单字段（直接尝试，找不到就跳过）
 */
const fillFormFields = (orderData: OrderData[]) => {
  isProcessing.value = true;
  matchedOrders.value = [];
  matchCount.value = 0;

  console.log("\n" + "=".repeat(60));
  console.log("🚀 开始填充表单字段...");
  console.log("=".repeat(60));

  // 遍历每个订单数据，直接尝试修改，找不到就跳过
  for (const order of orderData) {
    const { orderNumber, trackingNumber, shippingCarrier } = order;

    if (!orderNumber) {
      console.warn(`⚠️ 跳过空订单号的数据行`);
      continue;
    }

    try {
      // 构建选择器
      const selectSelector = `select[name="carrierNameSelect-${orderNumber}"]`;
      const inputSelector = `input[name="trackingCode-${orderNumber}"]`;

      // 直接尝试修改，如果找不到元素会返回 false
      const selectSuccess = changeSelectOption(
        selectSelector,
        shippingCarrier,
        "both"
      );
      const inputSuccess = changeInputValue(inputSelector, trackingNumber, true);

      // 只要两个都成功才算匹配成功
      if (selectSuccess && inputSuccess) {
        matchedOrders.value.push(orderNumber);
        matchCount.value++;
        console.log(`✅ 订单 ${orderNumber} 填充成功`);
      } else {
        // 找不到元素，静默跳过（不输出警告，因为这是正常情况）
        if (selectSuccess || inputSuccess) {
          // 如果部分成功，输出提示
          console.log(
            `⚠️ 订单 ${orderNumber} 部分填充 (select: ${selectSuccess}, input: ${inputSuccess})`
          );
        }
      }
    } catch (error) {
      console.error(`❌ 处理订单 ${orderNumber} 时发生错误:`, error);
    }
  }

  isProcessing.value = false;

  console.log("\n" + "=".repeat(60));
  console.log("✅ 表单填充完成！");
  console.log(`📊 成功匹配: ${matchCount.value}/${orderData.length} 个订单`);
  console.log(`📋 匹配的订单号:`, matchedOrders.value);
  console.log("=".repeat(60));
};

const clearFile = () => {
  selectedFile.value = null;
  fileContent.value = "";
  parseError.value = "";
  parsedData.value = [];
  matchedOrders.value = [];
  matchCount.value = 0;
  isProcessing.value = false;
  const input = document.querySelector(
    'input[type="file"]'
  ) as HTMLInputElement;
  if (input) {
    input.value = "";
  }
};
</script>

<template>
  <div class="file-upload-widget">
    <!-- 右下角按钮 -->
    <button
      class="toggle-button"
      @click="togglePanel"
      :class="{ active: isOpen }"
      title="打开文件上传"
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
    </button>

    <!-- 浮窗面板 -->
    <div v-if="isOpen" class="upload-panel">
      <div class="panel-header">
        <h3>文件上传</h3>
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
            type="file"
            id="file-input"
            accept=".csv"
            @change="handleFileSelect"
            class="file-input"
          />
          <label for="file-input" class="upload-label">
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
          <strong>⏳ 正在填充表单...</strong>
          <span>请稍候</span>
        </div>

        <!-- 匹配结果 -->
        <div
          v-if="!isProcessing && parsedData.length > 0 && !parseError"
          :class="[
            'match-result',
            matchCount === 0 ? 'match-result-empty' : ''
          ]"
        >
          <div class="match-header">
            <strong v-if="matchCount > 0">✅ 匹配成功</strong>
            <strong v-else>⚠️ 未找到匹配</strong>
            <button class="clear-button" @click="clearFile" title="清除">
              ×
            </button>
          </div>
          <div class="match-count">
            <template v-if="matchCount > 0">
              成功匹配 <strong>{{ matchCount }}</strong> 个订单
              <span class="total-count">/ {{ parsedData.length }} 个</span>
            </template>
            <template v-else>
              未匹配到任何订单
              <span class="total-count">（共 {{ parsedData.length }} 个订单）</span>
            </template>
          </div>
          <div v-if="matchedOrders.length > 0" class="matched-orders">
            <div class="orders-label">匹配的订单号：</div>
            <div class="orders-list">
              <span
                v-for="(orderNumber, index) in matchedOrders"
                :key="index"
                class="order-badge"
              >
                {{ orderNumber }}
              </span>
            </div>
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

.panel-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
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

.matched-orders {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #bbf7d0;
}

.orders-label {
  font-weight: 500;
  margin-bottom: 8px;
  color: #166534;
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
