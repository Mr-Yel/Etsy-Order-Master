import { browser } from "wxt/browser";
import { imgZipLog } from "./img-zip-log";
import {
  CONVERT_ATTEMPTS,
  CONVERT_BITMAP_MAX_EDGE,
  CONVERT_JPEG_QUALITY,
  CONVERT_MESSAGE_TIMEOUT_MS,
  CONVERT_PDF_MAX_EDGE,
  CONVERT_POLL_INTERVAL_MS,
  CONVERT_REQUEST_MESSAGE_TYPE,
  CONVERT_TIMEOUT_MS,
  ENSURE_OFFSCREEN_MESSAGE_TYPE,
  type ConvertKind,
  type ConvertRequestMessage,
  type ConvertResponse,
  type ConvertedPage,
  type EnsureOffscreenResponse,
  type ImageConvertRequest,
} from "./image-convert-types";

export type ConvertAttachmentOptions = {
  url: string;
  kind: Exclude<ConvertKind, "raw">;
  mimeType: string;
  filename: string;
  size: number;
  trace: string;
  /** 本次转换最多尝试次数；未指定时使用正式导出的默认值 3 */
  attempts?: number;
  signal?: AbortSignal;
};

/** 所有跨上下文消息都是同步 ack，单条最多等这么久 */
const MESSAGE_TIMEOUT_MS = CONVERT_MESSAGE_TIMEOUT_MS;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureOffscreenDocument(): Promise<void> {
  const response = (await browser.runtime.sendMessage({
    type: ENSURE_OFFSCREEN_MESSAGE_TYPE,
  })) as EnsureOffscreenResponse | undefined;

  if (!response?.ok) {
    throw new Error(response?.error ?? "无法创建 offscreen 转换页");
  }
}

function buildRequest(
  options: ConvertAttachmentOptions,
  jobId: string,
  timeoutMs: number
): ImageConvertRequest {
  return {
    type: "CONVERT",
    jobId,
    url: options.url,
    kind: options.kind,
    mimeType: options.mimeType,
    filename: options.filename,
    trace: options.trace,
    maxEdge:
      options.kind === "pdf" ? CONVERT_PDF_MAX_EDGE : CONVERT_BITMAP_MAX_EDGE,
    jpegQuality: CONVERT_JPEG_QUALITY,
    timeoutMs,
  };
}

/** 所有跨上下文消息都必须有硬超时，否则丢消息会让批次永久 pending */
async function sendToSw(
  msg: ConvertRequestMessage,
  timeoutMs: number
): Promise<ConvertResponse> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let response: ConvertResponse | undefined;
  try {
    response = (await Promise.race([
      browser.runtime.sendMessage(msg) as Promise<ConvertResponse | undefined>,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), timeoutMs);
      }),
    ])) as ConvertResponse | undefined;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
  if (!response) {
    throw new Error(`转换消息无响应（${Math.round(timeoutMs / 1000)}s）`);
  }
  return response;
}

async function runOnce(
  options: ConvertAttachmentOptions,
  attempt: number
): Promise<ConvertedPage[]> {
  const jobId = `${options.trace}-a${attempt}-${Date.now()}`;
  const timeoutMs = Math.max(
    CONVERT_TIMEOUT_MS,
    30_000 + Math.ceil(Math.max(options.size, 0) / 1_000_000) * 800
  );
  const req = buildRequest(options, jobId, timeoutMs);
  /** 业务用：转换总耗时上限判定，清理日志时不可删除 */
  const startedAt = Date.now();

  // 第一步：同步 ack，确认 offscreen 已接收任务。长任务不挂在这条消息上。
  const started = await sendToSw(
    { type: CONVERT_REQUEST_MESSAGE_TYPE, action: "start", req },
    MESSAGE_TIMEOUT_MS
  );
  if (!started.ok) throw new Error(started.error);
  if (!started.accepted) throw new Error("offscreen 未确认接收转换任务");

  let count = 0;
  let lastPhase = "";
  const pages: ConvertedPage[] = [];
  try {
    // 第二步：轮询状态，保留最后阶段用于超时报错。
    for (;;) {
      if (options.signal?.aborted) throw new Error("导出已取消");
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(
          `转换总耗时超限（${Math.round(timeoutMs / 1000)}s），最后阶段：${lastPhase || "unknown"}`
        );
      }
      const status = await sendToSw(
        { type: CONVERT_REQUEST_MESSAGE_TYPE, action: "status", jobId },
        MESSAGE_TIMEOUT_MS
      );
      if (!status.ok) throw new Error(status.error);
      lastPhase = status.phase ?? "";
      if (status.state === "done") {
        count = status.count ?? 0;
        break;
      }
      await wait(CONVERT_POLL_INTERVAL_MS);
    }

    for (let index = 0;index < count;index += 1) {
      if (options.signal?.aborted) throw new Error("导出已取消");
      const page = await sendToSw(
        { type: CONVERT_REQUEST_MESSAGE_TYPE, action: "page", jobId, index },
        MESSAGE_TIMEOUT_MS
      );
      if (!page.ok) throw new Error(page.error);
      if (!page.base64) throw new Error("转换页内容为空");
      pages.push({ base64: page.base64, ext: page.ext ?? "jpg" });

    }
  } finally {
    void browser.runtime
      .sendMessage({
        type: CONVERT_REQUEST_MESSAGE_TYPE,
        action: "release",
        jobId,
      })
      .catch(() => undefined);
  }

  return pages;
}

export async function convertAttachmentToImages(
  options: ConvertAttachmentOptions
): Promise<ConvertedPage[]> {
  const errors: string[] = [];
  const configuredAttempts = options.attempts ?? CONVERT_ATTEMPTS;
  const attempts = Number.isFinite(configuredAttempts)
    ? Math.max(1, Math.floor(configuredAttempts))
    : CONVERT_ATTEMPTS;
  const chainStartedAt = Date.now();

  for (let attempt = 1;attempt <= attempts;attempt += 1) {
    if (options.signal?.aborted) throw new Error("导出已取消");
    try {
      await ensureOffscreenDocument();
      const pages = await runOnce(options, attempt);
      imgZipLog("info", "content", "附件转换链路成功", {
        trace: options.trace,
        attempt,
        kind: options.kind,
        filename: options.filename,
        count: pages.length,
        elapsedMs: Date.now() - chainStartedAt,
      });
      return pages;
    } catch (error) {
      if (options.signal?.aborted) throw new Error("导出已取消");
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      imgZipLog("error", "content", "附件转换尝试失败", {
        trace: options.trace,
        attempt,
        attempts,
        message,
        elapsedMs: Date.now() - chainStartedAt,
      });
      if (attempt < attempts) await wait(200 * attempt);
    }
  }

  const summary = errors
    .map((message, index) => `第${index + 1}次：${message}`)
    .join(" | ");
  imgZipLog("error", "content", "附件转换重试耗尽", {
    trace: options.trace,
    kind: options.kind,
    filename: options.filename,
    url: options.url.slice(0, 200),
    attempts,
    summary,
    elapsedMs: Date.now() - chainStartedAt,
  });
  throw new Error(`附件转图片失败（尝试 ${attempts} 次）：${summary}`);
}
