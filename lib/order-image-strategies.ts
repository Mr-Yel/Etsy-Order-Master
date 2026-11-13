/** 格式策略是预览与导出的唯一选择入口；新增格式时在此注册。 */
export type OrderImageKind = "raw" | "pdf" | "heic" | "svg";

export type OrderImageSource = {
  url: string;
  filename: string;
  mimeType: string;
  thumbnailUrl?: string;
};

export type ImagePreviewSource = { url: string; fallbackUrl: string };
export type OrderImageStrategy = {
  matches(source: OrderImageSource): boolean;
  preview(source: OrderImageSource): ImagePreviewSource;
} & (
  | { kind: "raw"; exportMode: "original" }
  | { kind: Exclude<OrderImageKind, "raw">; exportMode: "convert" }
);

function pathname(url: string): string {
  try { return new URL(url, "https://placeholder.invalid").pathname.toLowerCase(); }
  catch { return url.toLowerCase(); }
}

function matchesFormat(source: OrderImageSource, extensions: string[]): boolean {
  const mime = (source.mimeType || "").toLowerCase();
  const name = (source.filename || "").toLowerCase();
  const path = pathname(source.url);
  return extensions.some(ext => mime.includes(ext) || name.endsWith("." + ext) || path.endsWith("." + ext));
}

/** Etsy 为文档生成 JPG 预览；只改图片地址尺寸，保留扩展名与查询参数。 */
function thumbnailPreview(source: OrderImageSource): ImagePreviewSource {
  const thumbnail = source.thumbnailUrl || "";
  return {
    url: thumbnail.replace(/ipf_75x75(?=[.])/i, "ipf_fullxfull"),
    fallbackUrl: thumbnail,
  };
}

export const orderImageStrategies: readonly OrderImageStrategy[] = [
  { kind: "pdf", matches: source => matchesFormat(source, ["pdf"]), preview: thumbnailPreview, exportMode: "convert" },
  { kind: "heic", matches: source => matchesFormat(source, ["heic", "heif"]), preview: thumbnailPreview, exportMode: "convert" },
  { kind: "svg", matches: source => matchesFormat(source, ["svg"]), preview: thumbnailPreview, exportMode: "convert" },
  {
    kind: "raw",
    matches: () => true,
    preview: source => ({ url: source.url || source.thumbnailUrl || "", fallbackUrl: source.thumbnailUrl || "" }),
    exportMode: "original",
  },
];

export function resolveOrderImageStrategy(source: OrderImageSource): OrderImageStrategy {
  // raw 为兼容现有行为的兜底策略，始终放在最后。
  return orderImageStrategies.find(strategy => strategy.matches(source))!;
}

export function getOrderImageStrategy(kind: OrderImageKind): OrderImageStrategy {
  const strategy = orderImageStrategies.find(strategy => strategy.kind === kind);
  if (!strategy) throw new Error("未注册的附件格式策略：" + kind);
  return strategy;
}
