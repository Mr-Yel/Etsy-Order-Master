/**
 * KST 接口代理 — 消息与请求/响应类型
 * 供 background 与 content/popup/options 共用，便于扩展更多 KST 接口
 */

export const KST_PROXY_MESSAGE_TYPE = "KST_PROXY" as const;

/** 代理请求中的 multipart 文件（base64，用于跨 context 传递） */
export type KstProxyFormFile = {
  base64: string;
  fileName: string;
  mimeType?: string;
};

/** 代理请求：path 为相对路径，如 /system/platform-orders/list */
export type KstProxyRequest = {
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** GET 时拼到 URL 的 query，会做 encode */
  query?: Record<string, string>;
  /** POST/PUT 时的 JSON body（与 formFile 互斥） */
  body?: unknown;
  /** multipart/form-data：文件（base64），与 body 互斥 */
  formFile?: KstProxyFormFile;
  /** multipart/form-data：其余表单字段 */
  formFields?: Record<string, string>;
  token: string;
};

/** 代理成功响应 */
export type KstProxySuccessResponse = {
  success: true;
  data: unknown;
};

/** 代理失败响应（含 401 时 code、autoLoggedIn） */
export type KstProxyErrorResponse = {
  success: false;
  error: string;
  /** 401 时存在，表示 token 过期 */
  code?: number;
  /** 401 后是否已用记住的凭据自动登录成功 */
  autoLoggedIn?: boolean;
};

export type KstProxyResponse = KstProxySuccessResponse | KstProxyErrorResponse;
