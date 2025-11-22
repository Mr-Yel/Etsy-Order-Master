/**
 * CSV 工具函数
 */

/**
 * CSV 表头定义
 */
export const CSV_HEADERS: string[] = [
  "Etsy Order Number（Required）",
  "Tracking Number（Required）",
  'Shipping Carrier（Optional）,The shipping carrier will be automatically matched,according to the "Tracking Number"(please check carefully, if it does not automatically backfill, you can try to resubmit).',
];

/**
 * 转义 CSV 单元格（处理包含逗号、引号、换行符的情况）
 */
export function escapeCSV(cell: string): string {
  if (cell.includes(",") || cell.includes('"') || cell.includes("\n")) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

/**
 * 构建 CSV 内容
 */
export function buildCSVContent(headers: string[], rows: string[][]): string {
  const escapedHeaders = headers.map(escapeCSV);
  const escapedRows = rows.map((row) => row.map(escapeCSV).join(","));
  
  return [escapedHeaders.join(","), ...escapedRows].join("\n");
}

/**
 * 下载 CSV 文件
 */
export function downloadCSV(
  csvContent: string,
  filename: string = "文件"
): void {
  // 添加 UTF-8 BOM 以支持中文（Excel 需要）
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], {
    type: "text/csv;charset=utf-8;",
  });

  // 创建下载链接
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();

  // 清理
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 下载空的 CSV 模板（只有表头，没有数据）
 */
export function downloadCSVTemplate(filename: string = "模板"): void {
  // 创建只有表头的 CSV（空数据行）
  const csvContent = buildCSVContent(CSV_HEADERS, []);
  downloadCSV(csvContent, filename);
}

