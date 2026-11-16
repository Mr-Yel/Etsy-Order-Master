import { fetchImageBinary } from "./image-binary-client";
import { convertAttachmentToImages } from "./image-convert-client";
import { getOrderImageStrategy, type OrderImageKind, type OrderImageSource } from "./order-image-strategies";

export type OrderImageExportSource = OrderImageSource & {
  kind: OrderImageKind;
  size: number;
  sourceExt: string;
};
export type OrderImageExportContext = { trace: string; signal?: AbortSignal; timeoutMs: number };
export type OrderImagePage = { ext: string } & (
  | { bytes: Uint8Array; base64?: never }
  | { base64: string; bytes?: never }
);

/** 预览策略与下载策略共用格式注册表；UI 只处理进度、命名和 ZIP。 */
export async function loadOrderImagePages(
  source: OrderImageExportSource,
  context: OrderImageExportContext,
): Promise<OrderImagePage[]> {
  if (context.signal?.aborted) throw new Error("导出已取消");
  const strategy = getOrderImageStrategy(source.kind);
  let pages: OrderImagePage[];
  if (strategy.exportMode === "convert") {
    pages = await convertAttachmentToImages({
      url: source.url, kind: strategy.kind, mimeType: source.mimeType,
      filename: source.filename, size: source.size,
      trace: context.trace, signal: context.signal,
    });
  } else {
    const bytes = await fetchImageBinary(source.url, context.signal);
    pages = [{ bytes, ext: source.sourceExt }];
  }
  if (context.signal?.aborted) throw new Error("导出已取消");
  if (!pages.length) throw new Error("转换未产出图片");
  return pages;
}
