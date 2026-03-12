/**
 * KST 需认证请求 — 统一封装：自动带 token，无 token 时打开登录页并抛错
 * 所有需要 token 的 KST 接口应通过本模块或 sendKstProxyRequest 发起，以便 401 在 proxy 层统一处理
 */
import { browser } from "wxt/browser";
import type { KstProxyRequest } from "./kst-proxy-types";
import { sendKstProxyRequest } from "./kst-proxy-client";
import { getNotyf } from "@/lib/notyf";
import { getToken } from "@/lib/auth-manager";

export type KstAuthenticatedRequestOptions = Omit<KstProxyRequest, "token">;

/**
 * 带认证的 KST 请求：自动从 storage 取 token，无 token 时轻提示、打开登录页并抛出
 */
export async function kstAuthenticatedRequest<T = unknown>(
  options: KstAuthenticatedRequestOptions
): Promise<T> {
  const token = await getToken();
  if (!token) {
    try {
      getNotyf().error("未登录，请先登录");
    } catch {
      // 无 DOM 时忽略
    }
    try {
      await browser.runtime.sendMessage({ type: "OPEN_LOGIN_PAGE" });
    } catch (e) {
      console.error("kstAuthenticatedRequest ~ error:", e)
    }
    throw new Error("未登录，请先登录");
  }
  return sendKstProxyRequest<T>({ ...options, token });
}
