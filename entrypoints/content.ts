import { createApp } from 'vue';
import FileUploadWidget from '@/components/FileUploadWidget.vue';

export default defineContentScript({
  matches: ['*://*/*'],
  runAt: 'document_end',
  registration: 'manifest',
  main() {
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

        // 挂载 Vue 组件
        try {
          const app = createApp(FileUploadWidget);
          app.mount(container);
        } catch (error) {
          console.error('文件上传组件挂载失败:', error);
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
