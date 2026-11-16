import { browser } from 'wxt/browser';
import { IMAGE_BINARY_REQUEST, IMAGE_BINARY_TIMEOUT_MS, MAX_IMAGE_BYTES } from './image-binary-fetch';

/** An extension iframe can fetch cross-origin; MessageChannel transfers bytes without JSON/Base64. */
export function fetchImageBinary(url: string, signal?: AbortSignal): Promise<Uint8Array> {
  if (signal?.aborted) return Promise.reject(new Error('导出已取消'));
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.hidden = true;
    iframe.src = browser.runtime.getURL('/image-transfer.html');
    const channel = new MessageChannel();
    let settled = false;
    const cleanup = () => {
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      channel.port1.close();
      channel.port2.close();
      iframe.remove();
    };
    const fail = (message: string) => {
      if (settled) return;
      channel.port1.postMessage({ cancel: true });
      cleanup();
      reject(new Error(message));
    };
    const abort = () => fail('导出已取消');
    const timer = setTimeout(() => fail('图片下载或二进制传输超时（120 秒）'), IMAGE_BINARY_TIMEOUT_MS);
    signal?.addEventListener('abort', abort, { once: true });
    channel.port1.onmessage = (event: MessageEvent) => {
      const buffer = event.data?.buffer;
      if (!(buffer instanceof ArrayBuffer) || !buffer.byteLength || buffer.byteLength > MAX_IMAGE_BYTES) {
        fail(event.data?.error || '图片二进制传输结果无效');
        return;
      }
      cleanup();
      resolve(new Uint8Array(buffer));
    };
    channel.port1.onmessageerror = () => fail('图片二进制传输失败');
    iframe.onerror = () => fail('无法加载图片传输页面，请重新加载插件和 Etsy 页面');
    iframe.onload = () => {
      if (settled) return;
      try {
        iframe.contentWindow?.postMessage({ type: IMAGE_BINARY_REQUEST, url }, iframe.src, [channel.port2]);
      } catch (error) {
        fail(error instanceof Error ? error.message : '无法建立二进制传输通道');
      }
    };
    document.documentElement.appendChild(iframe);
  });
}
