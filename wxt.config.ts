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

function readOptionalConfigValue(fileName: string, envName: string): string {
  const envValue = process.env[envName];
  if (typeof envValue === "string" && envValue.trim()) {
    return envValue.trim();
  }

  const file = join(process.cwd(), fileName);
  if (!existsSync(file)) return "";
  try {
    return readFileSync(file, "utf-8").trim();
  } catch {
    return "";
  }
}

function appLogConfigPlugin() {
  return {
    name: "eom-app-log-config",
    config() {
      const enabledRaw =
        process.env.EOM_APP_LOG_ENABLED?.trim() ||
        readOptionalConfigValue("app-log-enabled.txt", "EOM_APP_LOG_ENABLED");
      const clientId = readOptionalConfigValue(
        "app-log-client-id.txt",
        "EOM_APP_LOG_CLIENT_ID"
      );
      const clientSecret = readOptionalConfigValue(
        "app-log-client-secret.txt",
        "EOM_APP_LOG_CLIENT_SECRET"
      );
      const baseUrl =
        readOptionalConfigValue("app-log-base-url.txt", "EOM_APP_LOG_BASE_URL") ||
        "https://huangxiangkun.uno/etsy-log";
      const enabled =
        enabledRaw === "false"
          ? "false"
          : clientId && clientSecret
            ? "true"
            : "false";

      return {
        define: {
          "import.meta.env.VITE_EOM_APP_LOG_ENABLED": JSON.stringify(enabled),
          "import.meta.env.VITE_EOM_APP_LOG_BASE_URL": JSON.stringify(baseUrl),
          "import.meta.env.VITE_EOM_APP_LOG_CLIENT_ID": JSON.stringify(clientId),
          "import.meta.env.VITE_EOM_APP_LOG_CLIENT_SECRET":
            JSON.stringify(clientSecret),
        },
      };
    },
  };
}

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-vue"],
  vite: () => ({
    plugins: [devTokenPlugin(), appLogConfigPlugin()],
  }),
  manifest: {
    // 权限配置
    permissions: ['storage', 'tabs'],
    host_permissions: ['*://*.etsy.com/*', 'https://kstgl.kesiteng.cn/*', 'https://huangxiangkun.uno/*'],
    
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
