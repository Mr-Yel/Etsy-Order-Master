import { createApp } from 'vue';
import FileUploadWidget from '@/components/FileUploadWidget.vue';

export default defineContentScript({
  matches: ['*://*/*'],
  main() {
    // 创建容器元素
    const container = document.createElement('div');
    container.id = 'wxt-file-upload-widget';
    document.body.appendChild(container);

    // 挂载 Vue 组件
    const app = createApp(FileUploadWidget);
    app.mount(container);
  },
});
