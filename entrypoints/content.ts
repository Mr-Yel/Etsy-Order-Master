import { createApp } from 'vue';
import ContentScriptWrapper from '@/components/ContentScriptWrapper.vue';

export default defineContentScript({
  matches: ['*://*/*'],
  runAt: 'document_end',
  registration: 'manifest',
  main() {
    // 监听来自 popup 的消息，返回当前页面的 cookie
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log("🚀 ~ browser.runtime.onMessage.addListener ~ message:", message)
      if (message.type === 'GET_COOKIES') {
        try {
          // 从当前页面获取完整的 cookie
          const cookies = document.cookie;
          sendResponse({ success: true, cookies });
        } catch (error) {
          console.error('获取 cookie 失败:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : '未知错误' });
        }
        return true; // 保持消息通道开放，用于异步响应
      }
    });

    // 等待 DOM 完全加载
    const init = () => {
      if (document.body) {
        // 检查是否已经存在容器，避免重复注入
        let container = document.getElementById('wxt-file-upload-widget');
        if (!container) {
          container = document.createElement('div');
          container.id = 'wxt-file-upload-widget';
          document.body.appendChild(container);
        }

        // 挂载包装组件（由包装组件内部判断是否显示 FileUploadWidget）
        try {
          const app = createApp(ContentScriptWrapper);
          app.mount(container);
        } catch (error) {
          console.error('ContentScript 包装组件挂载失败:', error);
        }
      } else {
        // 如果 body 还不存在，等待一下再试
        setTimeout(init, 100);
      }
    };

    // 如果 DOM 已经准备好，立即执行
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      // DOM 已经加载完成
      init();
    }
  },
});
