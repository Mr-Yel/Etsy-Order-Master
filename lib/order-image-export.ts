import { fetchEtsyImagesAsBase64 } from "./etsy-bridge-client";
import { convertAttachmentToImages } from "./image-convert-client";
import type { ConvertedPage } from "./image-convert-types";
import { getOrderImageStrategy, type OrderImageKind, type OrderImageSource } from "./order-image-strategies";

export type OrderImageExportSource = OrderImageSource & {
  kind: OrderImageKind;
  size: number;
  sourceExt: string;
};
export type OrderImageExportContext = { trace: string; signal?: AbortSignal; timeoutMs: number };

/** 预览策略与下载策略共用格式注册表；UI 只处理进度、命名和 ZIP。 */
export async function loadOrderImagePages(
  source: OrderImageExportSource,
  context: OrderImageExportContext,
): Promise<ConvertedPage[]> {
  if (context.signal?.aborted) throw new Error("导出已取消");
  const strategy = getOrderImageStrategy(source.kind);
  let pages: ConvertedPage[];
  if (strategy.exportMode === "convert") {
    pages = await convertAttachmentToImages({
      url: source.url, kind: strategy.kind, mimeType: source.mimeType,
      filename: source.filename, size: source.size,
      trace: context.trace, signal: context.signal,
    });
  } else {
    const { images, results, failures = [] } = await fetchEtsyImagesAsBase64({
      urls: [source.url], timeoutMs: context.timeoutMs, concurrency: 1, trace: context.trace,
    });
    const result = results?.[0];
    if (result && !result.success) throw new Error(result.error);
    if (!result && failures[0]) throw new Error(failures[0].error);
    const base64 = result?.success ? result.base64 : images[0];
    if (!base64) throw new Error("图片内容为空");
    pages = [{ base64, ext: source.sourceExt }];
  }
  if (context.signal?.aborted) throw new Error("导出已取消");
  if (!pages.length) throw new Error("转换未产出图片");
  return pages;
}
