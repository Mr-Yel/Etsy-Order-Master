/**
 * 订单图包导出的关键结果日志。仅记录转换/导出成功及异常，
 * 不记录轮询、心跳、逐文件进度或附件内容。
 * 每行输出 JSON，可在控制台按 IMG-ZIP 过滤并通过 trace/batchId 关联。
 */
export type ImgZipLogSource = "page" | "content" | "sw" | "offscreen";
export type ImgZipLogLevel = "info" | "warn" | "error";

export function imgZipLog(
  level: ImgZipLogLevel,
  source: ImgZipLogSource,
  event: string,
  data: Record<string, unknown> = {}
): void {
  let line: string;

  try {
    line = JSON.stringify({
      tag: "IMG-ZIP",
      src: source,
      evt: event,
      ts: Date.now(),
      at: new Date().toISOString(),
      ...data,
    });
  } catch (error) {
    // 日志本身不允许把下载流程带崩
    line = JSON.stringify({
      tag: "IMG-ZIP",
      src: source,
      evt: event,
      ts: Date.now(),
      logStringifyError: error instanceof Error ? error.message : String(error),
    });
  }

  // 保留 info / warn / error 分级，DevTools 里仍能按颜色区分
  if (level === "error") {
    globalThis.console.error(line);
  } else if (level === "warn") {
    globalThis.console.warn(line);
  } else {
    globalThis.console.info(line);
  }
}
