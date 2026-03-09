/**
 * KST 接口代理 — 调用端（content script / popup / options）
 * 通过 sendMessage 让 background 代为请求，避免在页面上下文中触发 CORS
 */
import { browser } from "wxt/browser";
import type { KstProxyRequest, KstProxyResponse } from "./kst-proxy-types";
import { KST_PROXY_MESSAGE_TYPE } from "./kst-proxy-types";

/**
 * 通过 background 代理请求 KST 接口
 * @param req path、method、query、body、token
 * @returns 接口返回的 JSON
 * @throws 网络或业务错误时抛出 Error
 */
export async function sendKstProxyRequest<T = unknown>(req: KstProxyRequest): Promise<T> {
  const res = await browser.runtime.sendMessage({
    type: KST_PROXY_MESSAGE_TYPE,
    ...req,
  } as { type: string } & KstProxyRequest);

  const payload = res as KstProxyResponse | undefined;
  if (payload?.success === true) {
    return payload.data as T;
  }
  if (payload?.success === false && payload.error) {
    throw new Error(payload.error);
  }
  throw new Error("KST 代理未返回有效结果");
}
