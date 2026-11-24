import {
  POD_BACK_API_KEY,
  POD_BACK_BASE_URL,
  requirePodBackConfig,
} from "./podback-constants";
import { getToken, requireLogin } from "@/lib/auth-manager";
import { sendKstProxyRequest } from "@/lib/kst-proxy-client";
import type { KstProxyRequest } from "@/lib/kst-proxy-types";
import { runLimitedJobs } from "@/lib/limited-jobs.mjs";
import {
  buildPodBackHeaders,
  createPodBackIdempotencyKey,
  PodBackApiError,
  toPodBackApiError,
  unwrapPodBackData,
} from "@/lib/podback-utils.mjs";

/**
 * PodBack 所有请求统一走 background 代理。
 * API Key 由本模块自动注入，KST token 按接口要求选择必带或可选。
 */
export type PodBackAuthMode =
  | "api-key"
  | "optional-kst-token"
  | "required-kst-token";

export type PodBackRequestOptions = Omit<
  KstProxyRequest,
  "baseUrl" | "headers" | "token" | "reauthOn401"
> & {
  auth?: PodBackAuthMode;
  headers?: Record<string, string>;
};

async function resolvePodBackToken(
  mode: PodBackAuthMode
): Promise<string | undefined> {
  if (mode === "required-kst-token") {
    return await requireLogin();
  }
  if (mode === "optional-kst-token") {
    return (await getToken()) ?? undefined;
  }
  return undefined;
}

/**
 * 发起任意 PodBack 请求。
 * 多数接口只需 API Key；模板读取、生产图渲染等接口按需传 KST token。
 */
export async function requestPodBack<T>(
  options: PodBackRequestOptions,
  fallbackMessage = "PodBack 请求失败"
): Promise<T> {
  requirePodBackConfig();
  const { auth = "api-key", headers: customHeaders, ...request } = options;
  const token = await resolvePodBackToken(auth);
  try {
    const data = await sendKstProxyRequest<unknown>({
      ...request,
      baseUrl: POD_BACK_BASE_URL,
      headers: buildPodBackHeaders(
        POD_BACK_API_KEY,
        token,
        customHeaders
      ),
      token,
      reauthOn401: Boolean(token),
    });
    return unwrapPodBackData<T>(data, fallbackMessage);
  } catch (error) {
    throw toPodBackApiError(error, fallbackMessage);
  }
}

export { PodBackApiError };

export type PodBackHealthResponse = {
  service: string;
  status: string;
};

export function checkPodBackHealth(): Promise<PodBackHealthResponse> {
  return requestPodBack({
    path: "/health",
    method: "GET",
  });
}

export type PodBackSkuParseParams =
  | { skuName: string }
  | { skuNames: string[] };

export type PodBackSkuParseItem = {
  skuName: string;
  size: string;
  color: string;
  matched: boolean;
};

export type PodBackSkuParseResponse = {
  list: PodBackSkuParseItem[];
};

export function parsePodBackSkuNames(
  params: PodBackSkuParseParams
): Promise<PodBackSkuParseResponse> {
  return requestPodBack(
    {
      path: "/variants/parse",
      method: "POST",
      body: params,
    },
    "解析 SKU 名称失败"
  );
}

export type PodBackUploadResponse = {
  key: string;
  url: string;
  provider: string;
  target: string;
  size: number;
};

export function uploadPodBackFile(
  file: File,
  options: { fieldName?: string; headers?: Record<string, string> } = {}
): Promise<PodBackUploadResponse> {
  return requestPodBack(
    {
      path: "/upload/file",
      method: "POST",
      headers: options.headers,
      formFile: {
        blob: file,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fieldName: options.fieldName ?? "file",
      },
    },
    "上传文件到 PodBack 失败"
  );
}

export type PodBackPreviewRenderStatus =
  | "queued"
  | "processing"
  | "succeeded"
  | "failed";

export type PodBackPreviewRenderError = {
  code: string;
  message: string;
  retryable?: boolean | null;
  stack?: string | null;
};

export type PodBackPreviewRenderResult = {
  previewId: string;
  previewName: string | null;
  url: string | null;
  width: number;
  height: number;
  format: string;
  sizeBytes: number;
  expiresAt: string | null;
};

export type PodBackPreviewRenderJob = {
  jobId: string;
  orderId: string;
  templateId: string;
  status: PodBackPreviewRenderStatus;
  phase: string;
  generation: number;
  cached: boolean;
  results: PodBackPreviewRenderResult[];
  timings: Record<string, unknown> | null;
  queue: {
    position: number;
    ahead: number;
    maxConcurrency: number;
  } | null;
  error: PodBackPreviewRenderError | null;
  poll: {
    url?: string;
    afterMs: number;
  } | null;
};

export type PodBackPreviewRenderOrderStatus = {
  exists: boolean;
  orderId: string;
  job: PodBackPreviewRenderJob | null;
};

export type PodBackPreviewRenderBatchItem = {
  orderId: string;
  templateId: string;
  url: string;
};

export type PodBackPreviewRenderBatchResponse = {
  items: Array<{
    orderId: string;
    templateId: string;
    ok: boolean;
    cached: boolean;
    httpStatus: number;
    job: PodBackPreviewRenderJob | null;
    error: PodBackPreviewRenderError | null;
  }>;
  summary: {
    total: number;
    accepted: number;
    created: number;
    cached: number;
    failed: number;
  };
  poll: {
    url?: string;
    afterMs: number;
  };
};

export function createPodBackPreviewRenderJob(
  templateId: string | number,
  orderId: string,
  url: string
): Promise<PodBackPreviewRenderJob> {
  return requestPodBack(
    {
      path: `/preview-render/templates/${encodeURIComponent(String(templateId))}/jobs`,
      method: "POST",
      body: { orderId, url },
    },
    "创建预览图任务失败"
  );
}

export function createPodBackPreviewRenderJobFromFile(
  templateId: string | number,
  orderId: string,
  file: File
): Promise<PodBackPreviewRenderJob> {
  return requestPodBack(
    {
      path: `/preview-render/templates/${encodeURIComponent(String(templateId))}/jobs`,
      method: "POST",
      formFields: { orderId },
      formFile: {
        blob: file,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fieldName: "file",
      },
    },
    "创建预览图任务失败"
  );
}

export function createPodBackPreviewRenderBatch(
  items: PodBackPreviewRenderBatchItem[]
): Promise<PodBackPreviewRenderBatchResponse> {
  return requestPodBack(
    {
      path: "/preview-render/jobs/batch",
      method: "POST",
      body: { items },
    },
    "批量创建预览图任务失败"
  );
}

export function getPodBackPreviewRenderOrderStatus(
  orderId: string
): Promise<PodBackPreviewRenderOrderStatus> {
  return requestPodBack(
    {
      path: `/preview-render/orders/${encodeURIComponent(orderId)}/status`,
      method: "GET",
    },
    "查询预览图任务状态失败"
  );
}

export function getPodBackPreviewRenderJob(
  jobId: string
): Promise<PodBackPreviewRenderJob> {
  return requestPodBack(
    {
      path: `/preview-render/jobs/${encodeURIComponent(jobId)}`,
      method: "GET",
    },
    "查询预览图任务失败"
  );
}

export function getPodBackPreviewRenderOrderCurrent(
  orderId: string
): Promise<PodBackPreviewRenderJob | null> {
  return requestPodBack(
    {
      path: `/preview-render/orders/${encodeURIComponent(orderId)}/current`,
      method: "GET",
    },
    "查询当前预览图失败"
  );
}

export async function getPodBackPreviewRenderOrderStatuses(
  orderIds: string[]
): Promise<PodBackPreviewRenderOrderStatus[]> {
  const ids = [...new Set(orderIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const data = await requestPodBack<{
    items: PodBackPreviewRenderOrderStatus[];
  }>(
    {
      path: "/preview-render/orders/statuses",
      method: "POST",
      body: { orderIds: ids },
    },
    "批量查询预览图任务状态失败"
  );
  return Array.isArray(data?.items) ? data.items : [];
}

export type PodBackRenderJobStatus =
  | "queued"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled";

export type PodBackRenderElementImages = {
  /** elementId / elementIndex / elementName 三选一 */
  elementId?: string;
  elementIndex?: number;
  elementName?: string;
  fileIndexes?: number[];
  assetIds?: string[];
  urls?: string[];
  data?: string[];
};

export type PodBackRenderJobPayload = {
  layoutId: string;
  images: PodBackRenderElementImages[];
  fitModes?: Record<string, string>;
  originalImageVisible?: Record<string, boolean>;
  backgroundLayerId?: string;
  showCutline?: boolean;
  idempotencyKey?: string;
};

export type PodBackRenderJob = {
  jobId: string;
  status: PodBackRenderJobStatus;
  reused?: boolean;
  templateId?: string;
  layoutId?: string;
  revision?: string;
  statusUrl?: string;
  resultPath?: string;
  result?: {
    url: string;
    downloadUrl?: string;
    key?: string;
    width: number;
    height: number;
    bytes: number;
    durationMs: number;
  } | null;
  warnings: string[];
  error?: { code: string; message: string } | null;
  queue?: {
    position: number;
    ahead: number;
    estimatedWaitMs: number;
  };
  poll?: {
    afterMs: number;
    url?: string;
  };
  templateSource?: {
    kind?: string;
    revision?: string;
    cached?: boolean;
    stale?: boolean;
  };
  createdAt?: string;
};

export type PodBackRenderTemplateListParams = {
  keyword?: string;
  sourceHash?: string;
  shopId?: string;
  sku?: string;
  include?: "payload";
  page?: number;
  pageSize?: number;
};

export type PodBackRenderTemplateSummary = {
  id: string;
  name: string;
  schemaVersion?: number;
  sourceHash?: string;
  canvas?: { width: number; height: number };
  layoutCount?: number;
  layerCount?: number;
  revision?: number;
  shops?: Array<{ shopId: string; shopName: string }>;
  skus?: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type PodBackRenderTemplateListResponse = {
  list: PodBackRenderTemplateSummary[];
  total: number;
  page: number;
  pageSize: number;
};

export type PodBackRenderTemplateLayouts = {
  templateId: string;
  name: string;
  canvas: { width: number; height: number };
  defaultLayoutId: string;
  revision: string;
  layouts: Array<{
    id: string;
    name: string;
    isDefault?: boolean;
    instanceCount?: number;
    groups: Array<{
      index?: number;
      id: string;
      name: string;
      kind: "custom" | "fixed";
      instanceCount: number;
      maxImages: number;
      fitMode: string;
      hasOriginalImage: boolean;
    }>;
  }>;
};

export type PodBackRenderAsset = {
  assetId: string;
  url?: string | null;
  key?: string | null;
  storage?: "local" | "cos" | "kst";
  retentionMs?: number | null;
  width?: number;
  height?: number;
  bytes?: number;
  sourceBytes?: number;
  sourceFormat?: string;
  converted?: boolean;
};

export type PodBackRenderAssetStorage = "local" | "cos" | "kst";

export type PodBackRenderAssetUploadOptions = {
  storageProvider?: PodBackRenderAssetStorage;
};

export type PodBackRenderAssetUploadResult =
  | {
      file: File;
      ok: true;
      asset: PodBackRenderAsset;
    }
  | {
      file: File;
      ok: false;
      error: string;
    };

export function listPodBackRenderTemplates(
  params: PodBackRenderTemplateListParams = {}
): Promise<PodBackRenderTemplateListResponse> {
  const query: Record<string, string> = {};
  if (params.keyword?.trim()) query.keyword = params.keyword.trim();
  if (params.sourceHash?.trim()) query.sourceHash = params.sourceHash.trim();
  if (params.shopId?.trim()) query.shopId = params.shopId.trim();
  if (params.sku?.trim()) query.sku = params.sku.trim();
  if (params.include) query.include = params.include;
  if (params.page != null) query.page = String(params.page);
  if (params.pageSize != null) query.pageSize = String(params.pageSize);

  return requestPodBack(
    {
      path: "/production-image-generators/templates",
      method: "GET",
      query,
    },
    "查询生产图模板失败"
  );
}

export function getPodBackRenderTemplateLayouts(
  templateId: string | number
): Promise<PodBackRenderTemplateLayouts> {
  return requestPodBack(
    {
      path: `/production-image-generators/templates/${encodeURIComponent(String(templateId))}/layouts`,
      method: "GET",
      auth: "required-kst-token",
    },
    "查询模板元素清单失败"
  );
}

export function uploadPodBackRenderAsset(
  file: File,
  options: PodBackRenderAssetUploadOptions = {}
): Promise<PodBackRenderAsset> {
  return requestPodBack(
    {
      path: "/production-image-generators/render-assets",
      method: "POST",
      auth:
        options.storageProvider === "kst"
          ? "required-kst-token"
          : "optional-kst-token",
      headers: options.storageProvider
        ? { "x-file-storage-provider": options.storageProvider }
        : undefined,
      formFile: {
        blob: file,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fieldName: "file",
      },
    },
    "上传渲染素材失败"
  );
}

export async function uploadPodBackRenderAssets(
  files: File[],
  options: PodBackRenderAssetUploadOptions & { concurrency?: number } = {}
): Promise<PodBackRenderAssetUploadResult[]> {
  if (files.length === 0) return [];

  const results = await runLimitedJobs(
    files,
    (file) =>
      uploadPodBackRenderAsset(file, {
        storageProvider: options.storageProvider,
      }),
    { concurrency: options.concurrency ?? 3 }
  );

  return results.map((result, index) => {
    const file = files[index];
    if (result.success) {
      return { file, ok: true, asset: result.value };
    }
    return { file, ok: false, error: result.error };
  });
}

export function createPodBackRenderJob(
  templateId: string | number,
  payload: PodBackRenderJobPayload
): Promise<PodBackRenderJob> {
  return requestPodBack(
    {
      path: `/production-image-generators/templates/${encodeURIComponent(String(templateId))}/render-jobs`,
      method: "POST",
      auth: "required-kst-token",
      body: {
        ...payload,
        idempotencyKey:
          payload.idempotencyKey ?? createPodBackIdempotencyKey(),
        showCutline: false,
      },
    },
    "提交渲染任务失败"
  );
}

export function getPodBackRenderJob(jobId: string): Promise<PodBackRenderJob> {
  return requestPodBack(
    {
      path: `/production-image-generators/render-jobs/${encodeURIComponent(jobId)}`,
      method: "GET",
      auth: "optional-kst-token",
    },
    "查询渲染任务失败"
  );
}

export function cancelPodBackRenderJob(jobId: string): Promise<void> {
  return requestPodBack(
    {
      path: `/production-image-generators/render-jobs/${encodeURIComponent(jobId)}`,
      method: "DELETE",
      auth: "optional-kst-token",
    },
    "取消渲染任务失败"
  );
}
