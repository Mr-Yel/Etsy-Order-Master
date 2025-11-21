<script lang="ts" setup>
import { ref } from "vue";

const isOpen = ref(false);
const selectedFile = ref<File | null>(null);
const fileContent = ref<string>("");

const togglePanel = () => {
  isOpen.value = !isOpen.value;
};

const handleFileSelect = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (!file) return;

  selectedFile.value = file;

  // 读取文件内容
  const reader = new FileReader();
  reader.onload = (e) => {
    fileContent.value = e.target?.result as string;
  };
  reader.readAsText(file);
};

const clearFile = () => {
  selectedFile.value = null;
  fileContent.value = "";
  const input = document.querySelector(
    'input[type="file"]'
  ) as HTMLInputElement;
  if (input) {
    input.value = "";
  }
};
</script>

<template>
  <div class="file-upload-widget">
    <!-- 右下角按钮 -->
    <button
      class="toggle-button"
      @click="togglePanel"
      :class="{ active: isOpen }"
      title="打开文件上传"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="17 8 12 3 7 8"></polyline>
        <line x1="12" y1="3" x2="12" y2="15"></line>
      </svg>
    </button>

    <!-- 浮窗面板 -->
    <div v-if="isOpen" class="upload-panel">
      <div class="panel-header">
        <h3>文件上传</h3>
        <button class="close-button" @click="togglePanel" title="关闭">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="panel-content">
        <div class="upload-area">
          <input
            type="file"
            id="file-input"
            @change="handleFileSelect"
            class="file-input"
          />
          <label for="file-input" class="upload-label">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <span>点击选择文件</span>
          </label>
        </div>

        <div v-if="selectedFile" class="file-info">
          <div class="file-name">
            <strong>已选择文件：</strong>
            <span>{{ selectedFile.name }}</span>
            <button class="clear-button" @click="clearFile" title="清除">
              ×
            </button>
          </div>
          <div class="file-size">
            <strong>文件大小：</strong>
            <span>{{ (selectedFile.size / 1024).toFixed(2) }} KB</span>
          </div>
          <div class="file-type">
            <strong>文件类型：</strong>
            <span>{{ selectedFile.type || "未知" }}</span>
          </div>
        </div>

        <div v-if="fileContent" class="file-content">
          <div class="content-header">
            <strong>文件内容：</strong>
          </div>
          <pre class="content-preview">{{ fileContent }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-upload-widget {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 999999;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
}

.toggle-button {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transition: all 0.3s ease;
  position: relative;
}

.toggle-button:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
}

.toggle-button.active {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.upload-panel {
  position: absolute;
  bottom: 70px;
  right: 0;
  width: 400px;
  max-height: 600px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.panel-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.close-button {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: white;
  transition: background 0.2s ease;
}

.close-button:hover {
  background: rgba(255, 255, 255, 0.3);
}

.panel-content {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.upload-area {
  margin-bottom: 20px;
}

.file-input {
  display: none;
}

.upload-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  border: 2px dashed #cbd5e0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  color: #718096;
}

.upload-label:hover {
  border-color: #667eea;
  background: #f7fafc;
  color: #667eea;
}

.upload-label svg {
  margin-bottom: 12px;
}

.upload-label span {
  font-size: 14px;
  font-weight: 500;
}

.file-info {
  background: #f7fafc;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.file-name {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.file-name strong {
  color: #2d3748;
}

.file-name span {
  color: #4a5568;
  flex: 1;
  word-break: break-all;
}

.clear-button {
  background: #e53e3e;
  color: white;
  border: none;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  transition: background 0.2s ease;
}

.clear-button:hover {
  background: #c53030;
}

.file-size,
.file-type {
  margin-top: 8px;
  font-size: 14px;
  color: #4a5568;
}

.file-size strong,
.file-type strong {
  color: #2d3748;
  margin-right: 8px;
}

.file-content {
  background: #1a202c;
  border-radius: 8px;
  padding: 16px;
  max-height: 300px;
  overflow-y: auto;
}

.content-header {
  color: #e2e8f0;
  margin-bottom: 12px;
  font-size: 14px;
}

.content-preview {
  color: #a0aec0;
  font-size: 12px;
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: "Courier New", monospace;
}

/* 滚动条样式 */
.panel-content::-webkit-scrollbar,
.file-content::-webkit-scrollbar {
  width: 6px;
}

.panel-content::-webkit-scrollbar-track,
.file-content::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.panel-content::-webkit-scrollbar-thumb,
.file-content::-webkit-scrollbar-thumb {
  background: #cbd5e0;
  border-radius: 3px;
}

.panel-content::-webkit-scrollbar-thumb:hover,
.file-content::-webkit-scrollbar-thumb:hover {
  background: #a0aec0;
}
</style>
