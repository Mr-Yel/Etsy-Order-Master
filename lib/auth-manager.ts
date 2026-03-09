/**
 * 登录管理者 — 统一读写 eomUser，对外提供「是否登录 / 取 token / 登录 / 登出 / 打开登录页」
 * 所有与登录状态、token、用户信息相关的读写仅通过本模块，保证单一数据源。
 *
 * 本地免登录：构建时若存在 dev-token.txt 会注入 token；有该 token 时直接使用，不读 storage（该文件不提交，仅本地有则生效）。
 */
import { browser } from "wxt/browser";
import { getInfo, login as kstLogin } from "@/api";
import type { StoredUser } from "@/types/auth";

const STORAGE_KEY = "eomUser";

/** 构建时由 dev-token.txt 注入的本地免登录 token（有则用，不区分 dev/build） */
const getDevToken = (): string | null => {
  const t = import.meta.env.VITE_EOM_DEV_TOKEN;
  return typeof t === "string" && t.trim() ? t.trim() : null;
};

/**
 * 从本地存储读取当前用户信息。若构建时注入了 dev-token，则用该 token 调 getInfo 取真实用户信息返回（仅省去登录步骤，用户信息与正常登录一致）。
 */
export async function getStoredUser(): Promise<StoredUser | null> {
  const devToken = getDevToken();
  if (devToken) {
    try {
      const info = await getInfo(devToken);
      const nickName = info.nickName ?? info.userName ?? "";
      const deptName = info.dept?.deptName ?? "";
      return { token: devToken, name: nickName, deptName };
    } catch {
      return null;
    }
  }
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
  const devToken = getDevToken();
  if (devToken) return devToken;
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
