<template>
  <div class="login-page">
    <div class="login-wrap">
      <header class="login-header">
        <div class="login-brand">
          <span class="login-logo">EOM</span>
          <h1 class="login-title">{{ EOM_DISPLAY_NAME }}</h1>
        </div>
      </header>

      <main class="login-main">
        <section class="login-card">
          <h2 class="login-card-title">账号登录</h2>
          <p class="login-card-desc">使用 KST 账号登录</p>

          <form v-if="!isLoggedIn" class="login-form" @submit.prevent="handleLogin">
            <label class="form-field">
              <span class="form-label">用户名</span>
              <input
                v-model="username"
                class="form-input"
                type="text"
                placeholder="请输入用户名"
                :disabled="isSubmitting"
                autocomplete="username"
              />
            </label>
            <label class="form-field">
              <span class="form-label">密码</span>
              <input
                v-model="password"
                class="form-input"
                type="password"
                placeholder="请输入密码"
                :disabled="isSubmitting"
                autocomplete="current-password"
              />
            </label>
            <label class="form-remember">
              <input
                v-model="rememberCredentials"
                type="checkbox"
                class="form-checkbox"
                :disabled="isSubmitting"
              />
              <span class="form-remember-text">记住账号密码</span>
            </label>
            <div v-if="errorMsg" class="form-error" role="alert">
              {{ errorMsg }}
            </div>
            <button
              type="submit"
              class="btn btn-primary"
              :disabled="isSubmitting"
            >
              {{ isSubmitting ? "登录中…" : "登 录" }}
            </button>
          </form>

          <div v-else class="logged-in">
            <div class="logged-in-avatar">
              <span class="logged-in-avatar-text">{{ (storedName || "?").charAt(0) }}</span>
            </div>
            <div class="logged-in-info">
              <p class="logged-in-name">{{ storedName }}</p>
              <p v-if="storedDeptName" class="logged-in-dept">{{ storedDeptName }}</p>
            </div>
            <button type="button" class="btn btn-outline" @click="handleLogout">
              退出登录
            </button>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useAuth } from "@/composables/useAuth";
import {
  getRememberedCredentials,
  setRememberedCredentials,
  clearRememberedCredentials,
} from "@/lib/auth-manager";
import { EOM_DISPLAY_NAME } from "@/lib/runtime-identity";

const { user, isLoggedIn, login: doLogin, logout: doLogout } = useAuth();

const storedName = computed(() => user.value?.name ?? "");
const storedDeptName = computed(() => user.value?.deptName ?? "");

const username = ref("");
const password = ref("");
const rememberCredentials = ref(true);
const isSubmitting = ref(false);
const errorMsg = ref("");

onMounted(async () => {
  const saved = await getRememberedCredentials();
  if (saved) {
    username.value = saved.username;
    password.value = saved.password;
    rememberCredentials.value = true;
  }
});

const handleLogin = async () => {
  errorMsg.value = "";
  isSubmitting.value = true;
  try {
    await doLogin(username.value, password.value);
    if (rememberCredentials.value) {
      await setRememberedCredentials(username.value, password.value);
    } else {
      await clearRememberedCredentials();
    }
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : "登录失败，请重试";
  } finally {
    isSubmitting.value = false;
  }
};

const handleLogout = async () => {
  password.value = "";
  await doLogout();
};
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  background: linear-gradient(160deg, #f8fafc 0%, #e2e8f0 50%, #f1f5f9 100%);
  color: #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  box-sizing: border-box;
}

.login-wrap {
  width: 100%;
  max-width: 400px;
}

.login-header {
  text-align: center;
  margin-bottom: 28px;
}

.login-brand {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 6px;
}

.login-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.login-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.login-subtitle {
  margin: 0;
  font-size: 13px;
  color: #64748b;
}

.login-main {
  width: 100%;
}

.login-card {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.07),
    0 2px 4px -2px rgba(15, 23, 42, 0.05),
    0 0 0 1px rgba(15, 23, 42, 0.04);
  padding: 28px 24px;
}

.login-card-title {
  margin: 0 0 4px;
  font-size: 17px;
  font-weight: 600;
  color: #0f172a;
}

.login-card-desc {
  margin: 0 0 24px;
  font-size: 13px;
  color: #64748b;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 12px;
  font-weight: 500;
  color: #475569;
  letter-spacing: 0.01em;
}

.form-input {
  padding: 10px 12px;
  font-size: 14px;
  line-height: 1.4;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #0f172a;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s, background-color 0.2s;
}

.form-input::placeholder {
  color: #94a3b8;
}

.form-input:hover:not(:disabled) {
  background: #fff;
  border-color: #cbd5e1;
}

.form-input:focus {
  background: #fff;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.form-input:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.form-remember {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.form-checkbox {
  width: 16px;
  height: 16px;
  accent-color: #3b82f6;
  cursor: pointer;
}

.form-checkbox:disabled {
  cursor: not-allowed;
}

.form-remember-text {
  font-size: 13px;
  color: #475569;
}

.form-error {
  padding: 10px 12px;
  font-size: 13px;
  color: #b91c1c;
  background: #fef2f2;
  border-radius: 8px;
  border-left: 3px solid #dc2626;
}

.btn {
  padding: 11px 16px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s, transform 0.05s;
}

.btn:active:not(:disabled) {
  transform: scale(0.99);
}

.btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.btn-primary {
  margin-top: 4px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: #fff;
  box-shadow: 0 1px 2px rgba(37, 99, 235, 0.2);
}

.btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  box-shadow: 0 2px 4px rgba(37, 99, 235, 0.25);
}

.btn-outline {
  background: transparent;
  color: #64748b;
  border: 1px solid #e2e8f0;
}

.btn-outline:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
  color: #475569;
}

/* 已登录状态 */
.logged-in {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 8px 0 4px;
}

.logged-in-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.logged-in-avatar-text {
  font-size: 22px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: -0.02em;
}

.logged-in-info {
  margin-bottom: 20px;
}

.logged-in-name {
  margin: 0 0 2px;
  font-size: 17px;
  font-weight: 600;
  color: #0f172a;
}

.logged-in-dept {
  margin: 0;
  font-size: 13px;
  color: #64748b;
}

.logged-in .btn-outline {
  width: 100%;
}
</style>

