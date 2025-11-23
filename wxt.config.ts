import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    web_accessible_resources: [
      {
        resources: ['page-inject.js'],
        matches: ['*://*.etsy.com/*'],
        use_dynamic_url: true,
      },
    ],
  },
});
