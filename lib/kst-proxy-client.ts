/**
 * KST 接口代理 — 调用端（content script / popup / options）
 * 通过 sendMessage 让 background 代为请求，避免在页面上下文中触发 CORS
 * 收到 401 时：轻提示错误原因并打开登录页
 */
import { browser } from "wxt/browser";
import { getNotyf } from "@/lib/notyf";
import { sendKstProxyRequestViaPort } from "./kst-proxy-port";
import type { KstProxyRequest, KstProxyResponse } from "./kst-proxy-types";
import { KST_PROXY_MESSAGE_TYPE } from "./kst-proxy-types";
import { shouldUseKstProxyPortTransfer } from "./kst-proxy-transfer.mjs";

function handleKstProxyAuthError(payload: Extract<KstProxyResponse, { success: false }>) {
  if (payload.code !== 401) return;
  try {
    if (payload.autoLoggedIn) {
      getNotyf().success("登录已过期，已自动重新登录");
    } else {
      getNotyf().error(payload.error);
      void browser.runtime.sendMessage({ type: "OPEN_LOGIN_PAGE" });
    }
  } catch {
    // 无 DOM 时忽略 toast
  }
}

/**
 * 通过 background 代理请求 KST 接口
 * 小请求走 sendMessage；带 blob / 过大文件走 Port 分片
 * @param req path、method、query、body、token
 * @returns 接口返回的 JSON
 * @throws 网络或业务错误时抛出 Error；401 时先轻提示并打开登录页再抛出
 */
export async function sendKstProxyRequest<T = unknown>(req: KstProxyRequest): Promise<T> {
  const payload = shouldUseKstProxyPortTransfer(req.formFile)
    ? await sendKstProxyRequestViaPort(req)
    : ((await browser.runtime.sendMessage({
        type: KST_PROXY_MESSAGE_TYPE,
        ...req,
      })) as KstProxyResponse | undefined);

  if (payload?.success === true) {
    return payload.data as T;
  }
  if (payload?.success === false && payload.error) {
    handleKstProxyAuthError(payload);
    throw new Error(payload.error);
  }
  throw new Error("KST 代理未返回有效结果");
}
