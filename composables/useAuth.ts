/**
 * 登录状态 Composable — 基于 auth-manager 的响应式封装
 * 提供 user / isLoggedIn 与 login / logout / getToken / openLoginPage，
 * 并监听 storage 变化以在登录页登录/登出后同步 popup 等界面。
 */
import { computed, onMounted, onUnmounted, ref } from "vue";
import { browser } from "wxt/browser";
import * as authManager from "@/lib/auth-manager";
import type { StoredUser } from "@/types/auth";

const STORAGE_KEY = "eomUser";

export function useAuth() {
  const user = ref<StoredUser | null>(null);

  const isLoggedIn = computed(() => Boolean(user.value?.token));

  const loadUser = async () => {
    user.value = await authManager.getStoredUser();
  };

  const login = async (username: string, password: string) => {
    await authManager.login(username, password);
    await loadUser();
  };

  const logout = async () => {
    await authManager.logout();
    user.value = null;
  };

  const getToken = () => authManager.getToken();

  const openLoginPage = () => authManager.openLoginPage();

  const onStorageChange = (changes: Record<string, unknown>, areaName: string) => {
    if (areaName !== "local" || !(STORAGE_KEY in changes)) return;
    void loadUser();
  };

  onMounted(() => {
    void loadUser();
    browser.storage.onChanged.addListener(onStorageChange);
  });

  onUnmounted(() => {
    browser.storage.onChanged.removeListener(onStorageChange);
  });

  return {
    user,
    isLoggedIn,
    loadUser,
    login,
    logout,
    getToken,
    openLoginPage,
  };
}
