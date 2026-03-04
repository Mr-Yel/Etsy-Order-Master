<template>
  <div class="login-page">
    <header class="login-header">
      <h1 class="login-title">Etsy Order Master</h1>
      <p class="login-subtitle">请登录以继续使用插件功能</p>
    </header>

    <main class="login-main">
      <section class="login-card">
        <h2 class="login-card-title">账号登录</h2>
        <p class="login-card-desc">这里将来放具体的登录表单和逻辑。</p>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.login-page {
  min-height: 100vh;
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  background: #f3f4f6;
  color: #111827;
}

.login-header {
  padding: 32px 24px 16px;
  text-align: left;
}

.login-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
  color: #111827;
}

.login-subtitle {
  margin: 0;
  font-size: 14px;
  color: #6b7280;
}

.login-main {
  padding: 0 24px 32px;
}

.login-card {
  max-width: 420px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);
  padding: 24px 20px 20px;
}

.login-card-title {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  color: #111827;
}

.login-card-desc {
  margin: 0;
  font-size: 14px;
  color: #6b7280;
}
</style>

