// 必须用 legacy build：modern build 依赖原生 Uint8Array.prototype.toHex 等新 API，
// 旧版 Chromium 内核缺失会在 worker 的 get fingerprints() 里抛 "a.toHex is not a function"。
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import libheifFactory from "libheif-js/libheif-wasm/libheif-bundle.mjs";
import type { LibheifModule } from "libheif-js/libheif-wasm/libheif-bundle.mjs";
import { browser } from "wxt/browser";
import { imgZipLog } from "@/lib/img-zip-log";
import {
  CONVERT_FETCH_TIMEOUT_MS,
  CONVERT_JOB_WATCHDOG_MS,
  CONVERT_PAGE_RENDER_TIMEOUT_MS,
  CONVERT_PDF_OPEN_TIMEOUT_MS,
  CONVERT_MAX_PAGES,
  CONVERT_OFFSCREEN_MESSAGE_TYPE,
  CONVERT_PING_MESSAGE_TYPE,
  CONVERT_RESULT_TTL_MS,
  type ConvertJobState,
  type ConvertResponse,
  type ConvertedPage,
  type ImageConvertPageMessage,
  type ImageConvertRequest,
  type OffscreenMessage,
} from "@/lib/image-convert-types";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type EmitPage = (message: ImageConvertPageMessage) => void;

let libheifPromise: Promise<LibheifModule> | null = null;

function getLibheif(): Promise<LibheifModule> {
  if (!libheifPromise) {
    libheifPromise = Promise.resolve(libheifFactory()).catch((error) => {
      libheifPromise = null;
      throw error;
    });
  }
  return libheifPromise;
}

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("canvas 2d context 不可用");
  // JPEG 没有 alpha，先铺白底，避免透明区域变黑
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

function canvasToJpegBase64(canvas: HTMLCanvasElement, quality: number): string {
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  const separator = dataUrl.indexOf(",");
  if (separator < 0) throw new Error("canvas 导出 JPEG 失败");
  return dataUrl.slice(separator + 1);
}

function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

/**
 * pdf.js 的 worker 初始化失败时，getDocument / render 的 promise 会永久 pending，
 * 既不会 resolve 也不会 reject，任何外层 fetch 超时都兜不住，必须逐段加硬超时。
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} 超时（${Math.round(ms / 1000)}s）`)),
        ms
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

async function fetchOriginal(req: ImageConvertRequest): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const fetchTimeoutMs = Math.min(req.timeoutMs, CONVERT_FETCH_TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);
  try {

    const response = await fetch(req.url, {
      method: "GET",
      credentials: "include",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`附件下载失败 HTTP ${response.status}`);
    }
    const buffer = await response.arrayBuffer();

    return buffer;
  } finally {
    clearTimeout(timer);
  }
}

async function convertPdf(
  buffer: ArrayBuffer,
  req: ImageConvertRequest,
  emit: EmitPage,
  setPhase?: (phase: string) => void
): Promise<number> {

  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    // 扩展页面里只保留主 worker：关闭渲染 worker，避免第二个 module worker
    // 在 CSP 下加载失败导致 render promise 永久 pending。
    disableWorkerRendering: true,
    useWorkerFetch: false,
  });
  setPhase?.("pdf-open");

  const pdf = await withTimeout(
    task.promise,
    CONVERT_PDF_OPEN_TIMEOUT_MS,
    "PDF 打开 / worker 初始化"
  );

  const total = Math.min(pdf.numPages, CONVERT_MAX_PAGES);

  try {
    for (let pageNumber = 1;pageNumber <= total;pageNumber += 1) {

      setPhase?.(`get-page:${pageNumber}`);

      const page = await pdf.getPage(pageNumber);

      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(
        1,
        req.maxEdge / Math.max(baseViewport.width, baseViewport.height)
      );
      const viewport = page.getViewport({ scale });
      const { canvas, ctx } = makeCanvas(viewport.width, viewport.height);
      setPhase?.(`render:${pageNumber}`);

      const renderStartedAt = Date.now();
      const renderTask = page.render({
        canvas,
        canvasContext: ctx,
        viewport,
        // offscreen 文档不显示，不能依赖 requestAnimationFrame。
        // pdf.js 的 print 模式使用 Promise 调度，隐藏文档也能推进渲染。
        intent: "print",
        background: "#ffffff",
      });
      try {
        await withTimeout(
          renderTask.promise,
          CONVERT_PAGE_RENDER_TIMEOUT_MS,
          `PDF 第 ${pageNumber} 页渲染`
        );
      } catch (error) {
        // 结束失败的渲染任务，避免残留计算占用资源。
        let renderTaskCancelled = false;
        try {
          renderTask.cancel();
          renderTaskCancelled = true;
        } catch {
          // cancel 失败时继续释放 canvas，并保留原始错误信息。
        }
        imgZipLog("error", "offscreen", "PDF 页面渲染失败", {
          trace: req.trace,
          jobId: req.jobId,
          pageNumber,
          elapsedMs: Date.now() - renderStartedAt,
          width: canvas.width,
          height: canvas.height,
          renderTaskCancelled,
          error: error instanceof Error ? error.message : String(error),
        });
        releaseCanvas(canvas);
        throw error;
      }

      const base64 = canvasToJpegBase64(canvas, req.jpegQuality);
      emit({
        type: "PAGE",
        jobId: req.jobId,
        index: pageNumber - 1,
        total,
        base64,
        ext: "jpg",
      });

      page.cleanup();
      releaseCanvas(canvas);
    }
  } finally {
    // destroy() 在 worker 失联时也可能不 settle，不能让它把整个任务拖死
    await withTimeout(task.destroy(), 5000, "PDF task 销毁").catch(
      () => undefined
    );
  }
  return total;
}

async function convertHeic(
  buffer: ArrayBuffer,
  req: ImageConvertRequest,
  emit: EmitPage
): Promise<number> {
  const libheif = await getLibheif();

  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(new Uint8Array(buffer));
  if (!images || images.length === 0) {
    throw new Error("HEIC 未解码出任何图片");
  }
  const total = Math.min(images.length, CONVERT_MAX_PAGES);

  for (let i = 0;i < total;i += 1) {
    const image = images[i];
    const width = image.get_width();
    const height = image.get_height();
    if (!width || !height) {
      throw new Error(`HEIC 第 ${i + 1} 张尺寸无效`);
    }
    const source = document.createElement("canvas");
    source.width = width;
    source.height = height;
    const sourceCtx = source.getContext("2d");
    if (!sourceCtx) throw new Error("HEIC 临时 canvas 不可用");
    const imageData = sourceCtx.createImageData(width, height);
    await new Promise<void>((resolve, reject) => {
      image.display(imageData, (displayData) => {
        if (displayData) resolve();
        else reject(new Error("HEIC 像素解码失败"));
      });
    });
    sourceCtx.putImageData(imageData, 0, 0);

    const scale = Math.min(1, req.maxEdge / Math.max(width, height));
    const { canvas, ctx } = makeCanvas(width * scale, height * scale);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const base64 = canvasToJpegBase64(canvas, req.jpegQuality);
    emit({
      type: "PAGE",
      jobId: req.jobId,
      index: i,
      total,
      base64,
      ext: "jpg",
    });

    releaseCanvas(source);
    releaseCanvas(canvas);
  }
  return total;
}

async function convertSvg(
  buffer: ArrayBuffer,
  req: ImageConvertRequest,
  emit: EmitPage
): Promise<number> {
  const blob = new Blob([buffer], { type: "image/svg+xml" });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const width = image.naturalWidth || 1000;
    const height = image.naturalHeight || 1000;
    const scale = Math.min(1, req.maxEdge / Math.max(width, height));
    const { canvas, ctx } = makeCanvas(width * scale, height * scale);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const base64 = canvasToJpegBase64(canvas, req.jpegQuality);
    emit({
      type: "PAGE",
      jobId: req.jobId,
      index: 0,
      total: 1,
      base64,
      ext: "jpg",
    });

    releaseCanvas(canvas);
    return 1;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

type AttachmentConverter = (
  buffer: ArrayBuffer,
  req: ImageConvertRequest,
  emit: EmitPage,
  setPhase: (phase: string) => void,
) => Promise<number>;

// 新增需栅格化的格式时，类型检查会要求在此注册转换器。
const attachmentConverters: Record<ImageConvertRequest["kind"], AttachmentConverter> = {
  pdf: convertPdf,
  heic: convertHeic,
  svg: convertSvg,
};

type ConvertJob = {
  state: ConvertJobState;
  /** 供 status 轮询带出，页面控制台可直接看到 offscreen 内部卡在哪一步 */
  phase: string;
  startedAt: number;
  pages: ConvertedPage[];
  error?: string;
  watchdog?: ReturnType<typeof setTimeout>;
  ttl?: ReturnType<typeof setTimeout>;
};

/** jobId → 后台转换任务。任务生命周期与任何 message channel 完全解耦 */
const jobs = new Map<string, ConvertJob>();

function clearJobTimers(job: ConvertJob) {
  if (job.watchdog) clearTimeout(job.watchdog);
  if (job.ttl) clearTimeout(job.ttl);
  job.watchdog = undefined;
  job.ttl = undefined;
}

function armResultTtl(jobId: string, job: ConvertJob) {
  if (job.ttl) clearTimeout(job.ttl);
  job.ttl = setTimeout(() => {
    clearJobTimers(job);
    jobs.delete(jobId);
    imgZipLog("warn", "offscreen", "转换结果 TTL 到期已释放", { jobId });
  }, CONVERT_RESULT_TTL_MS);
}

async function runJob(req: ImageConvertRequest, job: ConvertJob): Promise<void> {
  const startedAt = Date.now();

  try {
    job.phase = "fetch";
    const buffer = await fetchOriginal(req);
    job.phase = "parse";
    const emit: EmitPage = (message) => {
      job.pages.push({ base64: message.base64, ext: message.ext });
      job.phase = `render:${message.index + 1}/${message.total}`;
    };
    const converter = attachmentConverters[req.kind];
    if (!converter) throw new Error("未注册的附件转换器：" + req.kind);
    await converter(buffer, req, emit, (phase) => { job.phase = phase; });
    if (job.pages.length === 0) throw new Error("转换未产出任何图片");
    if (job.state === "pending") {
      job.state = "done";
      job.phase = "done";
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (job.state === "pending") {
      job.state = "error";
      job.error = `[${job.phase}] ${message}`;
      job.phase = `error:${job.phase}`;
    }
    imgZipLog("error", "offscreen", "转换任务失败", {
      trace: req.trace,
      jobId: req.jobId,
      kind: req.kind,
      phase: job.phase,
      elapsedMs: Date.now() - startedAt,
      message,
    });
  } finally {
    if (job.watchdog) clearTimeout(job.watchdog);
    job.watchdog = undefined;
    armResultTtl(req.jobId, job);
  }
}

/**
 * 关键：所有分支一律「同步 sendResponse + return false」，与已验证可通的 PING 同构。
 * 长任务（fetch + pdf.js 渲染）放在 setTimeout 里后台跑，绝不挂在 message channel 上；
 * 否则 MV3 的异步 sendResponse 在 service worker 中继链路里会丢响应，导致永久 pending。
 */
browser.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const msg = raw as OffscreenMessage | undefined;
  if (!msg || msg.target !== "offscreen") return false;

  if (msg.type === CONVERT_PING_MESSAGE_TYPE) {

    const pong: ConvertResponse = { ok: true, build: "legacy" };
    sendResponse(pong);
    return false;
  }

  if (msg.type !== CONVERT_OFFSCREEN_MESSAGE_TYPE) return false;

  if (msg.action === "start" && msg.req) {
    const req = msg.req;
    let job = jobs.get(req.jobId);
    const isNewJob = !job;
    if (!job) {
      job = {
        state: "pending",
        phase: "queued",
        startedAt: Date.now(),
        pages: [],
      };
      jobs.set(req.jobId, job);
      const createdJob = job;
      createdJob.watchdog = setTimeout(() => {
        if (createdJob.state !== "pending") return;
        createdJob.state = "error";
        createdJob.error = `offscreen 转换超时（${Math.round(CONVERT_JOB_WATCHDOG_MS / 1000)}s），阶段 ${createdJob.phase}`;
        createdJob.phase = `timeout:${createdJob.phase}`;
        imgZipLog("error", "offscreen", "转换任务看门狗触发", {
          trace: req.trace,
          jobId: req.jobId,
          phase: createdJob.phase,
        });
        armResultTtl(req.jobId, createdJob);
      }, CONVERT_JOB_WATCHDOG_MS);
      // 先让 listener 同步返回，再启动后台任务
      setTimeout(() => {
        void runJob(req, createdJob);
      }, 0);
    }

    const ack: ConvertResponse = {
      ok: true,
      accepted: true,
      jobId: req.jobId,
      state: job.state,
    };
    sendResponse(ack);
    return false;
  }

  if (msg.action === "status") {
    const job = jobs.get(msg.jobId ?? "");
    if (!job) {
      const response: ConvertResponse = {
        ok: false,
        error: "转换任务不存在或已释放",
      };
      sendResponse(response);
      return false;
    }
    if (job.state === "error") {
      const response: ConvertResponse = {
        ok: false,
        error: job.error ?? "转换失败",
      };
      sendResponse(response);
      return false;
    }
    const response: ConvertResponse = {
      ok: true,
      jobId: msg.jobId,
      state: job.state,
      phase: job.phase,
      elapsedMs: Date.now() - job.startedAt,
      count: job.pages.length,
    };
    sendResponse(response);
    return false;
  }

  if (msg.action === "page") {
    const job = jobs.get(msg.jobId ?? "");
    const page = job?.pages[msg.index ?? -1];
    if (!job || !page) {
      const response: ConvertResponse = {
        ok: false,
        error: "转换结果不存在或已释放",
      };
      sendResponse(response);
      return false;
    }

    const response: ConvertResponse = {
      ok: true,
      base64: page.base64,
      ext: page.ext,
    };
    sendResponse(response);
    return false;
  }

  if (msg.action === "release") {
    const jobId = msg.jobId ?? "";
    const job = jobs.get(jobId);
    if (job) {
      clearJobTimers(job);
      jobs.delete(jobId);
    }
    const response: ConvertResponse = { ok: true };
    sendResponse(response);
    return false;
  }

  return false;
});
