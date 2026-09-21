/**
 * KST 接口代理 — 消息与请求/响应类型
 * 供 background 与 content/popup/options 共用，便于扩展更多 KST 接口
 */

export const KST_PROXY_MESSAGE_TYPE = "KST_PROXY" as const;

/** 代理请求中的 multipart 文件（跨 context 传递） */
export type KstProxyFormFile = {
  /** 小文件可走 JSON sendMessage；大文件请传 blob，由 Port 分片传输 */
  base64?: string;
  /** 二进制文件内容。存在时走 Port 分片，不再 JSON 序列化整包 */
  blob?: Blob;
  fileName: string;
  mimeType?: string;
  /** multipart 字段名，默认 file */
  fieldName?: string;
};

/** 代理请求：path 为相对路径，如 /system/platform-orders/list */
export type KstProxyRequest = {
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** 透传给目标接口的自定义请求头 */
  headers?: Record<string, string>;
  /** GET 时拼到 URL 的 query，会做 encode */
  query?: Record<string, string>;
  /** POST/PUT 时的 JSON body（与 formFile 互斥） */
  body?: unknown;
  /** multipart/form-data：文件，与 body 互斥 */
  formFile?: KstProxyFormFile;
  /** multipart/form-data：其余表单字段 */
  formFields?: Record<string, string>;
  token: string;
};

/** 去掉 blob 后的请求，可安全 JSON 序列化 */
export type KstProxySerializableRequest = Omit<KstProxyRequest, "formFile"> & {
  formFile?: Omit<KstProxyFormFile, "blob">;
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
