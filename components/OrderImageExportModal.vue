<script lang="ts" setup>
import { computed, onMounted, ref } from "vue";
import type { Directive } from "vue";
import JSZip from "jszip";
import { getEtsyData } from "@/composables/useEtsyData";
import {
  getDefaultOrderStateId,
  orderStatesToOptions,
} from "@/composables/useOrderStates";
import {
  buildEtsyOrderListBaseParams,
  fetchEtsyOrderList,
  fetchEtsyOrderPersonalizationFiles,
  type EtsyOrderPersonalizationFile,
} from "@/api/etsy-orders";
import { fetchEtsyImagesAsBase64 } from "@/lib/etsy-bridge-client";
import type { EtsyOrder, EtsyOrderTransaction } from "@/types/etsy-order";
import { getUploadedPhotoCount, isPhotoVariation } from "@/types/etsy-order";

const emit = defineEmits<{ (e: "close"): void }>();

type AttachmentStatus = "skipped" | "loading" | "loaded" | "error";

type OrderImageExportRow = {
  rowKey: string;
  orderId: number;
  transactionId: string;
  transactionIndex: number;
  sku: string;
  variations: Array<{
    property: string;
    value: string;
  }>;
  itemImageUrl: string;
  itemImageDownloadUrl: string;
  hasPersonalizationFiles: boolean;
  attachments: EtsyOrderPersonalizationFile[];
  attachmentStatus: AttachmentStatus;
  attachmentError: string;
  noteText: string;
};

const loading = ref(true);
const downloading = ref(false);
const error = ref<string | null>(null);
const rows = ref<OrderImageExportRow[]>([]);
const selected = ref<Set<string>>(new Set());
const orderStateOptions = ref<{ label: string; value: number }[]>([]);
const selectedOrderStateId = ref<number | "">("");
const pageSize = ref(999);
const previewImage = ref<{
  url: string;
  alt: string;
  x: number;
  y: number;
} | null>(null);

const vInitialText: Directive<HTMLElement, string> = {
  mounted(el, binding) {
    el.innerText = binding.value ?? "";
  },
  updated(el, binding) {
    if (document.activeElement === el) return;
    const next = binding.value ?? "";
    if (el.innerText !== next) {
      el.innerText = next;
    }
  },
};
const overflowTextPreview = ref<{
  text: string;
  x: number;
  y: number;
} | null>(null);

const selectedRows = computed(() =>
  rows.value.filter((row) => selected.value.has(row.rowKey))
);

const selectableRows = computed(() =>
  rows.value.filter((row) => hasSku(row))
);

const isAllSelected = computed(() => {
  if (selectableRows.value.length === 0) return false;
  return selectableRows.value.every((row) => selected.value.has(row.rowKey));
});

const selectedSkuCount = computed(
  () => new Set(selectedRows.value.map((row) => normalizeSku(row.sku))).size
);

function close() {
  emit("close");
}

function showImagePreview(url: string, alt: string, event: MouseEvent) {
  if (!url) return;
  updateImagePreviewPosition(event, url, alt);
}

function updateImagePreviewPosition(
  event: MouseEvent,
  url = previewImage.value?.url ?? "",
  alt = previewImage.value?.alt ?? ""
) {
  if (!url) return;
  const previewWidth = Math.min(420, Math.max(260, window.innerWidth * 0.42));
  const previewHeight = Math.min(520, Math.max(240, window.innerHeight * 0.72));
  const gap = 18;
  const rightX = event.clientX + gap;
  const leftX = event.clientX - previewWidth - gap;
  const x =
    rightX + previewWidth <= window.innerWidth - 12
      ? rightX
      : Math.max(12, leftX);
  const y = Math.min(
    Math.max(12, event.clientY - 12),
    Math.max(12, window.innerHeight - previewHeight - 12)
  );

  previewImage.value = { url, alt, x, y };
}

function hideImagePreview() {
  previewImage.value = null;
}

function showOverflowTextPreview(text: string, event: MouseEvent) {
  const el = event.currentTarget as HTMLElement | null;
  if (!el || el.scrollWidth <= el.clientWidth) return;
  updateOverflowTextPreviewPosition(text, event);
}

function updateOverflowTextPreviewPosition(
  text: string,
  event: MouseEvent
) {
  if (!overflowTextPreview.value && !text) return;
  const nextText = text || overflowTextPreview.value?.text || "";
  if (!nextText) return;
  overflowTextPreview.value = {
    text: nextText,
    x: Math.min(event.clientX + 12, window.innerWidth - 260),
    y: Math.min(event.clientY + 14, window.innerHeight - 60),
  };
}

function hideOverflowTextPreview() {
  overflowTextPreview.value = null;
}

function toggleAll() {
  if (isAllSelected.value) {
    selected.value = new Set();
  } else {
    selected.value = new Set(selectableRows.value.map((row) => row.rowKey));
  }
}

function toggleRow(row: OrderImageExportRow) {
  if (!hasSku(row)) return;
  const next = new Set(selected.value);
  if (next.has(row.rowKey)) next.delete(row.rowKey);
  else next.add(row.rowKey);
  selected.value = next;
}

function hasUploadVariation(transaction: EtsyOrderTransaction): boolean {
  return (transaction.variations ?? []).some((variation) => {
    if (!isPhotoVariation(variation)) return false;
    const count = getUploadedPhotoCount(variation);
    return count > 0 || (variation.value ?? "").trim().length > 0;
  });
}

function getVariationNote(transaction: EtsyOrderTransaction): string {
  return getVariationFields(transaction)
    .filter((variation) => variation.property.toLowerCase() !== "photo")
    .map((variation) => `${variation.property}：${variation.value}`)
    .join("\n");
}

function normalizeSku(sku: string): string {
  const trimmed = sku.trim();
  if (!trimmed) return "未命名SKU";

  const extracted = extractSkuByDxhRule(trimmed);
  return extracted || trimmed;
}

function extractSkuByDxhRule(sku: string): string {
  const match = sku.match(/(DG.*?D)XH/i);
  return match?.[1] ?? "";
}

function hasSku(row: OrderImageExportRow): boolean {
  return row.sku.trim().length > 0;
}

function decodeHtmlEntities(value: string): string {
  if (!value) return "";
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function getVariationFields(
  transaction: EtsyOrderTransaction
): Array<{ property: string; value: string }> {
  return (transaction.variations ?? [])
    .map((variation) => ({
      property: decodeHtmlEntities((variation.property ?? "").trim()),
      value: decodeHtmlEntities((variation.value ?? "").trim()),
    }))
    .filter((variation) => variation.property || variation.value);
}

function sanitizeFilePart(value: string): string {
  return (value || "未命名")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "未命名";
}

function getExtFromUrl(url: string, fallback = "jpg"): string {
  try {
    const pathname = new URL(url, location.origin).pathname;
    const match = pathname.match(/\.([a-z0-9]+)$/i);
    if (match?.[1]) return match[1].toLowerCase();
  } catch {
    // ignore
  }
  return fallback;
}

function getExtFromAttachment(file: EtsyOrderPersonalizationFile): string {
  const nameMatch = file.filename.match(/\.([a-z0-9]+)$/i);
  if (nameMatch?.[1]) return nameMatch[1].toLowerCase();
  if (file.mimeType === "image/png") return "png";
  if (file.mimeType === "image/webp") return "webp";
  if (file.mimeType === "image/gif") return "gif";
  return getExtFromUrl(file.url, "jpg");
}

function toLargeEtsyImageUrl(url: string): string {
  if (!url) return url;
  const replaced = url.replace(/_\d+x\d+(?=\.)/, "_1000x1000");
  if (replaced !== url) return replaced;
  return url.replace(/75x75/g, "1000x1000");
}

function buildRows(orderList: EtsyOrder[]): OrderImageExportRow[] {
  return orderList.flatMap((order) => {
    const transactions =
      order.transactions != null && order.transactions.length > 0
        ? order.transactions
        : [{ type: "Etsy_Order_Transaction" }];

    return transactions.map((transaction, index) => {
      const transactionId = String(
        transaction.transaction_id ?? order.transaction_ids?.[index] ?? ""
      );
      const sku = transaction.product?.product_identifier ?? "";
      const imageUrl = transaction.product?.image_url_75x75 ?? "";

      return {
        rowKey: `${order.order_id}-${transactionId || index}`,
        orderId: order.order_id,
        transactionId,
        transactionIndex: index + 1,
        sku,
        variations: getVariationFields(transaction),
        itemImageUrl: imageUrl,
        itemImageDownloadUrl: toLargeEtsyImageUrl(imageUrl),
        hasPersonalizationFiles: hasUploadVariation(transaction),
        attachments: [],
        attachmentStatus: hasUploadVariation(transaction) ? "loading" : "skipped",
        attachmentError: "",
        noteText: getVariationNote(transaction),
      };
    });
  });
}

async function loadAttachmentsForRows(shopId: number) {
  const orderIds = Array.from(
    new Set(
      rows.value
        .filter((row) => row.hasPersonalizationFiles)
        .map((row) => row.orderId)
    )
  );

  await Promise.all(
    orderIds.map(async (orderId) => {
      try {
        const files = await fetchEtsyOrderPersonalizationFiles(shopId, orderId, {
          credentials: "include",
        });
        rows.value = rows.value.map((row) => {
          if (row.orderId !== orderId || !row.hasPersonalizationFiles) return row;
          const matchedFiles = files.filter(
            (file) => String(file.transactionId) === row.transactionId
          );
          return {
            ...row,
            attachments: matchedFiles,
            attachmentStatus: "loaded",
            attachmentError: "",
          };
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "获取订单附件失败";
        rows.value = rows.value.map((row) =>
          row.orderId === orderId && row.hasPersonalizationFiles
            ? {
                ...row,
                attachmentStatus: "error",
                attachmentError: message,
              }
            : row
        );
      }
    })
  );
}

async function fetchOrders() {
  loading.value = true;
  error.value = null;
  rows.value = [];
  selected.value = new Set();

  try {
    const etsy = await getEtsyData();
    if (!etsy.success || etsy.shopId == null) {
      error.value = etsy.error ?? "无法获取店铺 ID，请确保在 Etsy 订单页打开";
      return;
    }

    if (orderStateOptions.value.length === 0 && etsy.orderStates?.length) {
      orderStateOptions.value = orderStatesToOptions(etsy.orderStates);
      const defaultId = getDefaultOrderStateId(etsy.orderStates);
      if (selectedOrderStateId.value === "" && defaultId != null) {
        selectedOrderStateId.value = defaultId;
      }
    }

    const stateIdRaw =
      selectedOrderStateId.value !== ""
        ? selectedOrderStateId.value
        : orderStateOptions.value[0]?.value;
    if (stateIdRaw == null) {
      error.value = "无法获取订单状态";
      return;
    }

    const { orders: orderList } = await fetchEtsyOrderList(
      etsy.shopId,
      pageSize.value,
      buildEtsyOrderListBaseParams(String(stateIdRaw)),
      { credentials: "include" }
    );

    rows.value = buildRows(orderList);
    selected.value = new Set(
      rows.value.filter((row) => hasSku(row)).map((row) => row.rowKey)
    );
    await loadAttachmentsForRows(etsy.shopId);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "获取订单图片数据失败";
  } finally {
    loading.value = false;
  }
}

function onNoteInput(row: OrderImageExportRow, event: Event) {
  const el = event.currentTarget as HTMLElement | null;
  row.noteText = el?.innerText ?? "";
}

function base64ToBlob(base64: string, type = "application/zip"): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

async function downloadSelected() {
  const data = selectedRows.value;
  if (data.length === 0 || downloading.value) return;

  downloading.value = true;
  error.value = null;

  try {
    const zip = new JSZip();
    const imageJobs: Array<{
      url: string;
      folderName: string;
      filename: string;
    }> = [];
    const productImageSkuSet = new Set<string>();

    for (const row of data) {
      const sku = normalizeSku(row.sku);
      const folderName = sanitizeFilePart(sku);
      const folder = zip.folder(folderName);
      if (!folder) continue;

      if (row.itemImageDownloadUrl && !productImageSkuSet.has(folderName)) {
        const ext = getExtFromUrl(row.itemImageDownloadUrl, "jpg");
        imageJobs.push({
          url: row.itemImageDownloadUrl,
          folderName,
          filename: `${sanitizeFilePart(sku)}.${ext}`,
        });
        productImageSkuSet.add(folderName);
      }

      row.attachments.forEach((file, index) => {
        const ext = getExtFromAttachment(file);
        imageJobs.push({
          url: file.url,
          folderName,
          filename: `${row.orderId}_${row.transactionIndex}_附件${index + 1}.${ext}`,
        });
      });

      const noteText = row.noteText.trim();
      if (noteText) {
        folder.file(`${row.orderId}_${row.transactionIndex}.txt`, noteText, {
          binary: false,
        });
      }
    }

    if (imageJobs.length > 0) {
      const { images } = await fetchEtsyImagesAsBase64({
        urls: imageJobs.map((job) => job.url),
      });

      images.forEach((base64, index) => {
        const job = imageJobs[index];
        if (!job || !base64) return;
        zip.folder(job.folderName)?.file(job.filename, base64, { base64: true });
      });
    }

    const zipBase64 = await zip.generateAsync({ type: "base64" });
    const blob = base64ToBlob(zipBase64);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `order-images-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "订单图片导出失败";
  } finally {
    downloading.value = false;
  }
}

onMounted(() => {
  void fetchOrders();
});
</script>

<template>
  <div class="modal-overlay" @click.self="close">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-header-left">
          <h2 class="modal-title">订单图片导出</h2>
          <label v-if="orderStateOptions.length > 0" class="field-inline">
            <span>订单状态</span>
            <select
              v-model.number="selectedOrderStateId"
              class="state-select"
              :disabled="loading || downloading"
              @change="fetchOrders"
            >
              <option
                v-for="opt in orderStateOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
          </label>
          <label class="field-inline">
            <span>数量</span>
            <input
              v-model.number="pageSize"
              type="number"
              min="1"
              max="999"
              class="page-size-input"
              :disabled="loading || downloading"
              @change="fetchOrders"
            />
          </label>
        </div>
        <button type="button" class="btn-close" aria-label="关闭" @click="close">
          ×
        </button>
      </div>

      <div class="modal-body">
        <div v-if="loading" class="loading">加载中...</div>
        <div v-else-if="error" class="error">
          <p>{{ error }}</p>
          <button type="button" class="btn-retry" @click="fetchOrders">
            重试
          </button>
        </div>
        <div v-else class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th class="col-check">
                  <input
                    type="checkbox"
                    :checked="isAllSelected"
                    :indeterminate="selected.size > 0 && !isAllSelected"
                    :disabled="selectableRows.length === 0"
                    @change="toggleAll"
                  />
                </th>
                <th>Order ID</th>
                <th>商品图</th>
                <th>订单附件</th>
                <th>变体信息</th>
                <th>
                  <span class="header-help-wrap">
                    备注
                    <span class="help-icon" aria-label="备注说明">?</span>
                    <span class="header-help-tooltip">
                      这里面的内容会被写入备注txt文件中
                    </span>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in rows"
                :key="row.rowKey"
                :class="{ 'row-disabled': !hasSku(row) }"
              >
                <td class="col-check">
                  <input
                    type="checkbox"
                    :checked="selected.has(row.rowKey)"
                    :disabled="!hasSku(row)"
                    @change="toggleRow(row)"
                  />
                </td>
                <td class="text-cell">
                  <div>{{ row.orderId }}</div>
                  <div class="sub-text">第 {{ row.transactionIndex }} 项</div>
                  <div class="sub-text">{{ normalizeSku(row.sku) }}</div>
                  <div v-if="!hasSku(row)" class="disabled-reason">
                    无 SKU，无法选择
                  </div>
                </td>
                <td>
                  <span v-if="row.itemImageUrl" class="image-preview-wrap">
                    <img
                      :src="row.itemImageUrl"
                      class="thumb"
                      loading="lazy"
                      alt="商品图"
                      @mouseenter="
                        showImagePreview(
                          row.itemImageDownloadUrl || row.itemImageUrl,
                          '商品图大图',
                          $event
                        )
                      "
                      @mousemove="updateImagePreviewPosition($event)"
                      @mouseleave="hideImagePreview"
                    />
                  </span>
                  <span v-else class="muted">无商品图</span>
                </td>
                <td class="attachment-cell">
                  <div v-if="row.attachmentStatus === 'skipped'" class="muted">
                    无附件
                  </div>
                  <div v-else-if="row.attachmentStatus === 'loading'" class="muted">
                    附件加载中...
                  </div>
                  <div v-else-if="row.attachmentStatus === 'error'" class="error-text">
                    {{ row.attachmentError }}
                  </div>
                  <div v-else-if="row.attachments.length === 0" class="muted">
                    未返回附件
                  </div>
                  <div v-else class="attachment-list">
                    <span
                      v-for="file in row.attachments"
                      :key="file.fileId"
                      class="image-preview-wrap"
                    >
                      <img
                        :src="file.thumbnailUrl"
                        :title="file.filename"
                        class="thumb"
                        loading="lazy"
                        alt="订单附件"
                        @mouseenter="showImagePreview(file.url, '订单附件大图', $event)"
                        @mousemove="updateImagePreviewPosition($event)"
                        @mouseleave="hideImagePreview"
                      />
                    </span>
                  </div>
                </td>
                <td class="variations-cell">
                  <div v-if="row.variations.length === 0" class="muted">
                    无变体
                  </div>
                  <div v-else class="variation-form">
                    <label
                      v-for="(variation, index) in row.variations"
                      :key="`${row.rowKey}-variation-${index}`"
                      class="variation-field"
                    >
                      <span class="variation-label">
                        <span
                          class="variation-label-text"
                          @mouseenter="
                            showOverflowTextPreview(
                              variation.property || '未命名',
                              $event
                            )
                          "
                          @mousemove="
                            updateOverflowTextPreviewPosition(
                              variation.property || '未命名',
                              $event
                            )
                          "
                          @mouseleave="hideOverflowTextPreview"
                        >
                          {{ variation.property || "未命名" }}
                        </span>
                      </span>
                      <input
                        class="variation-input"
                        type="text"
                        :value="variation.value"
                        readonly
                      />
                    </label>
                  </div>
                </td>
                <td>
                  <div
                    v-initial-text="row.noteText"
                    class="note-editor"
                    contenteditable="true"
                    data-placeholder="输入个性化备注"
                    @input="onNoteInput(row, $event)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="modal-footer">
        <span>已选 {{ selectedRows.length }} 项 / {{ selectedSkuCount }} 个 SKU</span>
        <button
          type="button"
          class="btn-export"
          :disabled="loading || downloading || selectedRows.length === 0"
          @click="downloadSelected"
        >
          {{ downloading ? "打包中..." : "下载总 ZIP" }}
        </button>
      </div>
    </div>
    <img
      v-if="previewImage"
      :src="previewImage.url"
      :alt="previewImage.alt"
      class="image-preview"
      :style="{
        left: `${previewImage.x}px`,
        top: `${previewImage.y}px`,
      }"
    />
    <div
      v-if="overflowTextPreview"
      class="text-preview"
      :style="{
        left: `${overflowTextPreview.x}px`,
        top: `${overflowTextPreview.y}px`,
      }"
    >
      {{ overflowTextPreview.text }}
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal {
  width: min(1180px, 96vw);
  max-height: 90vh;
  background: #fff;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
}

.modal-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.modal-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.field-inline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #6b7280;
}

.state-select,
.page-size-input {
  padding: 6px 10px;
  font-size: 14px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
}

.page-size-input {
  width: 80px;
}

.btn-close {
  width: 32px;
  height: 32px;
  font-size: 24px;
  line-height: 1;
  color: #6b7280;
  background: none;
  border: none;
  cursor: pointer;
  border-radius: 6px;
}

.btn-close:hover {
  background: #f3f4f6;
  color: #374151;
}

.modal-body {
  flex: 1;
  overflow: auto;
  padding: 16px 20px;
}

.loading,
.error {
  text-align: center;
  padding: 40px 20px;
  color: #6b7280;
}

.btn-retry,
.btn-export {
  padding: 9px 16px;
  font-size: 14px;
  font-weight: 500;
  color: #fff;
  background: #3b82f6;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.btn-retry:hover,
.btn-export:hover:not(:disabled) {
  background: #2563eb;
}

.btn-export:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.table-wrap {
  overflow-x: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.table th,
.table td {
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid #e5e7eb;
}

.table th {
  font-weight: 600;
  color: #374151;
  background: #f9fafb;
}

.header-help-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.help-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  background: #6b7280;
  border-radius: 999px;
  cursor: help;
}

.header-help-tooltip {
  position: absolute;
  left: 0;
  top: calc(100% + 8px);
  z-index: 1003;
  width: max-content;
  max-width: 240px;
  padding: 7px 9px;
  color: #fff;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.4;
  background: rgba(17, 24, 39, 0.94);
  border-radius: 6px;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.24);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-2px);
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.header-help-wrap:hover .header-help-tooltip {
  opacity: 1;
  transform: translateY(0);
}

.row-disabled td {
  background: #f9fafb;
  color: #9ca3af;
}

.col-check {
  width: 40px;
  text-align: center;
}

.text-cell {
  white-space: nowrap;
}

.sub-text,
.muted {
  color: #6b7280;
  font-size: 12px;
}

.error-text {
  max-width: 220px;
  color: #991b1b;
  font-size: 12px;
  white-space: normal;
}

.disabled-reason {
  margin-top: 4px;
  color: #b45309;
  font-size: 12px;
}

.thumb {
  width: 58px;
  height: 58px;
  object-fit: cover;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #f9fafb;
}

.image-preview-wrap {
  display: inline-flex;
  width: 58px;
  height: 58px;
}

.image-preview {
  position: fixed;
  z-index: 1001;
  width: min(420px, 42vw);
  max-height: min(520px, 72vh);
  object-fit: contain;
  padding: 8px;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  box-shadow: 0 16px 42px rgba(0, 0, 0, 0.28);
  pointer-events: none;
}

.attachment-cell {
  min-width: 150px;
}

.attachment-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.variations-cell {
  min-width: 220px;
}

.variation-form {
  display: grid;
  gap: 6px;
}

.variation-field {
  display: grid;
  grid-template-columns: 86px minmax(120px, 1fr);
  align-items: center;
  gap: 6px;
}

.variation-label {
  color: #4b5563;
  font-size: 12px;
  min-width: 0;
}

.variation-label-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.variation-input {
  width: 100%;
  min-width: 0;
  padding: 5px 7px;
  color: #374151;
  font-size: 12px;
  line-height: 1.3;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  background: #f9fafb;
  box-sizing: border-box;
}

.text-preview {
  position: fixed;
  z-index: 1002;
  max-width: 360px;
  padding: 6px 8px;
  color: #fff;
  font-size: 12px;
  line-height: 1.35;
  background: rgba(17, 24, 39, 0.94);
  border-radius: 6px;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.24);
  pointer-events: none;
  white-space: normal;
  word-break: break-word;
}

.note-editor {
  width: 240px;
  min-height: 68px;
  max-height: 140px;
  overflow: auto;
  padding: 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  line-height: 1.4;
  white-space: pre-wrap;
  outline: none;
}

.note-editor:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 1px #3b82f6;
}

.note-editor:empty::before {
  content: attr(data-placeholder);
  color: #9ca3af;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 20px;
  border-top: 1px solid #e5e7eb;
  color: #4b5563;
  font-size: 14px;
}
</style>
