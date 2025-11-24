import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    // 权限配置
    permissions: ['storage', 'tabs'],
    host_permissions: ['*://*.etsy.com/*'],
    
    // Web 可访问资源
    web_accessible_resources: [
      {
        resources: ['page-inject.js'],
        matches: ['*://*.etsy.com/*'],
        use_dynamic_url: true,
      },
    ],
    
    // Content Security Policy
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'; frame-src 'self'; child-src 'self'",
    },
  },
});
