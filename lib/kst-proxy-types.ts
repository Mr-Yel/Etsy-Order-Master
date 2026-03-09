/**
 * KST 接口代理 — 消息与请求/响应类型
 * 供 background 与 content/popup/options 共用，便于扩展更多 KST 接口
 */

export const KST_PROXY_MESSAGE_TYPE = "KST_PROXY" as const;

/** 代理请求：path 为相对路径，如 /system/platform-orders/list */
export type KstProxyRequest = {
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** GET 时拼到 URL 的 query，会做 encode */
  query?: Record<string, string>;
  /** POST/PUT 时的 JSON body */
  body?: unknown;
  token: string;
};

/** 代理成功响应 */
export type KstProxySuccessResponse = {
  success: true;
  data: unknown;
};

/** 代理失败响应 */
export type KstProxyErrorResponse = {
  success: false;
  error: string;
};

export type KstProxyResponse = KstProxySuccessResponse | KstProxyErrorResponse;
