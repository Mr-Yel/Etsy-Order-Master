import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "wxt";

/** 构建时从 dev-token.txt 读取本地免登录 token 并注入（不区分 dev/build，有文件则注入；该文件不提交） */
function devTokenPlugin() {
  return {
    name: "eom-dev-token",
    config() {
      const file = join(process.cwd(), "dev-token.txt");
      let token = "";
      if (existsSync(file)) {
        try {
          token = readFileSync(file, "utf-8").trim();
        } catch {
          // ignore
        }
      }
      return {
        define: {
          "import.meta.env.VITE_EOM_DEV_TOKEN": JSON.stringify(token),
        },
      };
    },
  };
}

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-vue"],
  vite: () => ({
    plugins: [devTokenPlugin()],
  }),
  manifest: {
    // 权限配置
    permissions: ['storage', 'tabs'],
    host_permissions: ['*://*.etsy.com/*', 'https://kstgl.kesiteng.cn/*'],
    
    // Web 可访问资源
    web_accessible_resources: [
      {
        resources: ['page-inject.js'],
        matches: ['*://*.etsy.com/*'],
      },
    ],
    
    // Content Security Policy
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'; frame-src 'self'; child-src 'self'",
    },
  },
});
