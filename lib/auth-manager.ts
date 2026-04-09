/**
 * 登录管理者 — 统一读写 eomUser，对外提供「是否登录 / 取 token / 登录 / 登出 / 打开登录页」
 * 所有与登录状态、token、用户信息相关的读写仅通过本模块，保证单一数据源。
 *
 * 本地免登录：构建时若存在 dev-token.txt 会注入 token；有该 token 时直接使用，不读 storage（该文件不提交，仅本地有则生效）。
 */
import { browser } from "wxt/browser";
import { getInfo, login as kstLogin } from "@/api";
import type { StoredUser } from "@/types/auth";
import { getNotyf } from "@/lib/notyf";
import { sendKstProxyRequest } from "@/lib/kst-proxy-client";

const OPEN_LOGIN_PAGE_MESSAGE_TYPE = "OPEN_LOGIN_PAGE" as const;

const STORAGE_KEY = "eomUser";
const CREDENTIALS_STORAGE_KEY = "eomRememberCredentials";

export type RememberedCredentials = {
  username: string;
  password: string;
};

export type AuthDebugSnapshot = {
  runtimeId?: string;
  hasDevToken: boolean;
  devTokenLength: number;
  storageHasUser: boolean;
  storageHasToken: boolean;
  storageTokenLength: number;
  storageUserName: string;
  storageDeptName: string;
  hasRememberedCredentials: boolean;
  rememberedUsername: string;
  rememberedPasswordLength: number;
  effectiveHasUser: boolean;
  effectiveHasToken: boolean;
};

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
 * 读取「记住的账号密码」（仅登录页回填用）
 */
export async function getRememberedCredentials(): Promise<RememberedCredentials | null> {
  try {
    const result = await browser.storage.local.get(CREDENTIALS_STORAGE_KEY);
    const stored = result[CREDENTIALS_STORAGE_KEY] as RememberedCredentials | undefined;
    if (!stored?.username) return null;
    return { username: stored.username, password: stored.password ?? "" };
  } catch {
    return null;
  }
}

/**
 * 保存「记住的账号密码」
 */
export async function setRememberedCredentials(
  username: string,
  password: string
): Promise<void> {
  await browser.storage.local.set({
    [CREDENTIALS_STORAGE_KEY]: {
      username: username.trim(),
      password,
    },
  });
}

/**
 * 清除「记住的账号密码」
 */
export async function clearRememberedCredentials(): Promise<void> {
  await browser.storage.local.remove(CREDENTIALS_STORAGE_KEY);
}

export async function getAuthDebugSnapshot(): Promise<AuthDebugSnapshot> {
  const devToken = getDevToken();
  let storedUser: StoredUser | null = null;
  let rememberedCredentials: RememberedCredentials | null = null;

  try {
    const result = await browser.storage.local.get([
      STORAGE_KEY,
      CREDENTIALS_STORAGE_KEY,
    ]);
    const rawUser = result[STORAGE_KEY] as StoredUser | undefined;
    const rawCredentials = result[
      CREDENTIALS_STORAGE_KEY
    ] as RememberedCredentials | undefined;

    storedUser = rawUser ?? null;
    rememberedCredentials =
      rawCredentials?.username != null
        ? {
            username: rawCredentials.username,
            password: rawCredentials.password ?? "",
          }
        : null;
  } catch (error) {
    console.warn("[KST] getAuthDebugSnapshot: failed to read storage", error);
  }

  const effectiveUser =
    devToken != null && devToken.trim()
      ? await getStoredUser()
      : storedUser;

  return {
    runtimeId: browser.runtime.id,
    hasDevToken: Boolean(devToken),
    devTokenLength: devToken?.length ?? 0,
    storageHasUser: Boolean(storedUser),
    storageHasToken: Boolean(storedUser?.token),
    storageTokenLength: storedUser?.token?.length ?? 0,
    storageUserName: storedUser?.name ?? "",
    storageDeptName: storedUser?.deptName ?? "",
    hasRememberedCredentials: Boolean(rememberedCredentials?.username),
    rememberedUsername: rememberedCredentials?.username ?? "",
    rememberedPasswordLength: rememberedCredentials?.password?.length ?? 0,
    effectiveHasUser: Boolean(effectiveUser),
    effectiveHasToken: Boolean(effectiveUser?.token),
  };
}

export type Handle401Result = {
  autoLoggedIn: boolean;
  errorMessage?: string;
};

/**
 * 统一处理 401（token 过期）：清除登录态，尝试用记住的凭据自动登录
 * 由 background 在代理请求返回 code 401 时调用
 */
export async function handle401(): Promise<Handle401Result> {
  console.log("[KST] handle401: 清除本地登录态");
  await browser.storage.local.remove(STORAGE_KEY);
  const credentials = await getRememberedCredentials();
  if (!credentials?.username) {
    console.log("[KST] handle401: 无记住的凭据，需手动登录");
    return { autoLoggedIn: false, errorMessage: "登录已过期，请重新登录" };
  }
  try {
    console.log("[KST] handle401: 尝试用记住的凭据自动登录");
    await login(credentials.username, credentials.password);
    console.log("[KST] handle401: 自动登录成功");
    return { autoLoggedIn: true };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "自动登录失败，请重新登录";
    console.warn("[KST] handle401: 自动登录失败", e);
    return { autoLoggedIn: false, errorMessage };
  }
}

const GET_INFO_PATH = "/getInfo";

/**
 * 确保有有效会话：有 token 时请求一次 getInfo，触发 401 时由 proxy 层统一处理（toast + 打开登录页）
 * 无 token 时轻提示并打开登录页。用于订单页等入口在 onMounted 时做一次登录态校验。
 */
export async function ensureSession(): Promise<void> {
  const token = await getToken();
  if (!token) {
      getNotyf().error("未登录，请先登录");

    try {
      await browser.runtime.sendMessage({ type: OPEN_LOGIN_PAGE_MESSAGE_TYPE });
    } catch (e) {
      await openLoginPage();
    }
    return;
  }
  try {
    await sendKstProxyRequest<{ code?: number; user?: unknown }>({
      path: GET_INFO_PATH,
      method: "GET",
      token,
    });
  } catch {
    // 401 等已由 sendKstProxyRequest 内 toast + openLoginPage 处理
  }
}

/**
 * 打开或聚焦登录页（用于 popup/background 等入口）
 * 注意：content script 可能无 tabs 权限，应通过 sendMessage 让 background 执行
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
      const newTab = await browser.tabs.create({ url: loginUrl });
    }
  } catch (error) {
    console.error("openLoginPage ~ error:", error)
  }
}
