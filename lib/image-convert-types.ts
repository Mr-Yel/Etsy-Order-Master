/** 订单附件转图片：跨 content / service worker / offscreen 的协议定义 */

export const ENSURE_OFFSCREEN_MESSAGE_TYPE =
  "IMG_ZIP_ENSURE_OFFSCREEN" as const;
export const CLOSE_OFFSCREEN_MESSAGE_TYPE =
  "IMG_ZIP_CLOSE_OFFSCREEN" as const;
/** content → SW 的一次性请求；SW 必须中继，content 不能直连 offscreen */
export const CONVERT_REQUEST_MESSAGE_TYPE =
  "IMG_ZIP_CONVERT_REQUEST" as const;
/** SW → offscreen 的内部消息，只有 offscreen 会响应 */
export const CONVERT_OFFSCREEN_MESSAGE_TYPE =
  "IMG_ZIP_CONVERT_OFFSCREEN" as const;
/** SW → offscreen 探活，确认转换页脚本真的跑起来了 */
export const CONVERT_PING_MESSAGE_TYPE = "IMG_ZIP_CONVERT_PING" as const;

/**
 * start   : 同步 ack，offscreen 立即接收任务并在后台转换
 * status  : 同步查询任务状态（轮询），返回 phase / state / count
 * page    : 同步取回第 N 页 JPEG
 * release : 释放任务结果
 * 注意：不允许任何分支「return true 后异步 sendResponse」，长任务必须脱离消息通道。
 */
export type ConvertAction = "start" | "status" | "page" | "release";

export type ConvertRequestMessage = {
  type: typeof CONVERT_REQUEST_MESSAGE_TYPE;
  action: ConvertAction;
  jobId?: string;
  index?: number;
  req?: ImageConvertRequest;
};

export type ConvertJobState = "pending" | "done" | "error";

export type ConvertResponse =
  | {
      ok: true;
      jobId?: string;
      /** start 的 ack 标记 */
      accepted?: boolean;
      /** status 轮询结果 */
      state?: ConvertJobState;
      phase?: string;
      elapsedMs?: number;
      count?: number;
      base64?: string;
      ext?: string;
      build?: string;
    }
  | { ok: false; error: string };

export type OffscreenMessage =
  | (Omit<ConvertRequestMessage, "type"> & {
      type: typeof CONVERT_OFFSCREEN_MESSAGE_TYPE;
      target: "offscreen";
    })
  | { type: typeof CONVERT_PING_MESSAGE_TYPE; target: "offscreen" };

export type EnsureOffscreenResponse =
  | { ok: true; path: string }
  | { ok: false; error: string };

/** 需要栅格化后才能作为图片导出的附件类型 */
export type { OrderImageKind as ConvertKind } from "./order-image-strategies";
import type { OrderImageKind as ConvertKind } from "./order-image-strategies";

export type ImageConvertRequest = {
  type: "CONVERT";
  jobId: string;
  url: string;
  kind: Exclude<ConvertKind, "raw">;
  mimeType: string;
  filename: string;
  trace: string;
  /** 输出图片最长边，PDF 默认 2000，位图默认 3000 */
  maxEdge: number;
  jpegQuality: number;
  timeoutMs: number;
};

export type ImageConvertPageMessage = {
  type: "PAGE";
  jobId: string;
  index: number;
  total: number;
  base64: string;
  ext: string;
};

export type ConvertedPage = {
  base64: string;
  ext: string;
};

/** 单次导出任务的转换上限，防止异常文件拖死整批 */
export const CONVERT_MAX_PAGES = 50;
export const CONVERT_JPEG_QUALITY = 0.85;
export const CONVERT_PDF_MAX_EDGE = 2000;
export const CONVERT_BITMAP_MAX_EDGE = 3000;
export const CONVERT_ATTEMPTS = 3;
export const CONVERT_TIMEOUT_MS = 90000;
/** 单条同步消息的硬超时：ack / status / page 都应在毫秒级返回 */
export const CONVERT_MESSAGE_TIMEOUT_MS = 15000;
/** status 轮询间隔 */
export const CONVERT_POLL_INTERVAL_MS = 400;
/** offscreen 后台任务的硬看门狗：必须早于 content 总超时，才能把真实错误回传 */
export const CONVERT_JOB_WATCHDOG_MS = 80000;
/** 转换结果在 offscreen 内的保留时长，防止异常中断造成内存泄漏 */
export const CONVERT_RESULT_TTL_MS = 5 * 60 * 1000;
/** 原文件下载 / PDF 打开 / 单页渲染各自的硬超时，防止 pdf.js promise 永久 pending */
export const CONVERT_FETCH_TIMEOUT_MS = 60000;
export const CONVERT_PDF_OPEN_TIMEOUT_MS = 30000;
export const CONVERT_PAGE_RENDER_TIMEOUT_MS = 30000;
