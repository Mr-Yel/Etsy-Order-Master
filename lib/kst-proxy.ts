/**
 * KST 接口代理 — Background 端执行逻辑
 * 仅在 background 中 import 使用，在此发起请求无 CORS 限制
 */
import { KST_BASE_URL } from "@/api/constants";
import type { KstProxyRequest } from "./kst-proxy-types";

/**
 * 在 background 上下文中请求 KST 接口
 * @param req 代理请求（path、method、query、body 或 formFile+formFields、token）
 * @returns 接口返回的 JSON（未做 code 校验，由调用方按业务处理）
 */
export async function runKstProxyInBackground(req: KstProxyRequest): Promise<unknown> {
  const { path, method = "GET", headers: customHeaders, query, body, formFile, formFields, token } = req;

  const pathNormalized = path.startsWith("/") ? path : `/${path}`;
  let url = `${KST_BASE_URL.replace(/\/$/, "")}${pathNormalized}`;

  if (query && Object.keys(query).length > 0) {
    const search = new URLSearchParams(query);
    url += `?${search.toString()}`;
  }

  const headers: Record<string, string> = {
    ...(customHeaders ?? {}),
    Accept: "application/json, text/plain, */*",
    Authorization: `Bearer ${token}`,
  };

  const init: RequestInit = {
    method,
    headers,
  };

  if (formFile != null && formFields != null) {
    const formData = new FormData();
    const binary = Uint8Array.from(atob(formFile.base64), (c) => c.charCodeAt(0));
    const blob = new Blob([binary], { type: formFile.mimeType ?? "application/octet-stream" });
    formData.append("file", blob, formFile.fileName);
    for (const [k, v] of Object.entries(formFields)) {
      formData.append(k, v);
    }
    init.body = formData;
    // 不设置 Content-Type，让浏览器自动带 boundary
  } else if (body != null && (method === "POST" || method === "PUT")) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);
  const data = await res.json();

  if (!res.ok) {
    const msg = (data as { msg?: string })?.msg ?? res.statusText ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}
