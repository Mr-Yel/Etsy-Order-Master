/**
 * 登录管理者 — 统一读写 eomUser，对外提供「是否登录 / 取 token / 登录 / 登出 / 打开登录页」
 * 所有与登录状态、token、用户信息相关的读写仅通过本模块，保证单一数据源。
 */
import { browser } from "wxt/browser";
import { getInfo, login as kstLogin } from "@/api";
import type { StoredUser } from "@/types/auth";

const STORAGE_KEY = "eomUser";

/**
 * 从本地存储读取当前用户信息
 */
export async function getStoredUser(): Promise<StoredUser | null> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY] as StoredUser | undefined;
    return stored ?? null;
  } catch {
    return null;
  }
}

/**
 * 判断当前是否已登录（以存在有效 token 为准）
 */
export async function isLoggedIn(): Promise<boolean> {
  const user = await getStoredUser();
  return Boolean(user?.token);
}

/**
 * 获取当前 token，未登录时返回 null
 */
export async function getToken(): Promise<string | null> {
  const user = await getStoredUser();
  return user?.token ?? null;
}

/**
 * 执行登录：调 KST 接口获取 token 与用户信息，写入本地存储
 * @throws 登录失败或获取用户信息失败时抛出 Error
 */
export async function login(username: string, password: string): Promise<void> {
  const u = username.trim();
  if (!u || !password) {
    throw new Error("请输入用户名和密码");
  }
  const token = await kstLogin(u, password);
  const info = await getInfo(token);
  const nickName = info.nickName ?? info.userName ?? u;
  const deptName = info.dept?.deptName ?? "";
  const user: StoredUser = { token, name: nickName, deptName };
  await browser.storage.local.set({ [STORAGE_KEY]: user });
}

/**
 * 登出：清除本地存储的用户信息
 */
export async function logout(): Promise<void> {
  await browser.storage.local.remove(STORAGE_KEY);
}

/**
 * 打开或聚焦登录页（用于 popup/background 等入口）
 */
export async function openLoginPage(): Promise<void> {
  const loginUrl = browser.runtime.getURL("/login.html");
  try {
    const tabs = await browser.tabs.query({ url: loginUrl });
    if (tabs.length > 0) {
      const targetTab = tabs[0];
      if (targetTab.id != null) {
        await browser.tabs.update(targetTab.id, { active: true });
      }
      if (targetTab.windowId != null) {
        await browser.windows.update(targetTab.windowId, { focused: true });
      }
    } else {
      await browser.tabs.create({ url: loginUrl });
    }
  } catch (error) {
    console.error("openLoginPage error:", error);
  }
}
