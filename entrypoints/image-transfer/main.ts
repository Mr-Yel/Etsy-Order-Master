import { IMAGE_BINARY_REQUEST, IMAGE_BINARY_TIMEOUT_MS, readImageBytes } from '@/lib/image-binary-fetch';

// Only Etsy parents may request downloads, and only from the image CDN.
window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window.parent) return;
  let parentUrl: URL;
  try { parentUrl = new URL(event.origin); } catch { return; }
  if (parentUrl.protocol !== 'https:' || !(parentUrl.hostname === 'etsy.com' || parentUrl.hostname.endsWith('.etsy.com'))) return;
  if (event.data?.type !== IMAGE_BINARY_REQUEST || !event.ports[0]) return;
  const port = event.ports[0];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_BINARY_TIMEOUT_MS);
  port.onmessage = () => controller.abort();
  port.start();
  void (async () => {
    try {
      const url = new URL(event.data.url);
      if (url.protocol !== 'https:' || url.hostname !== 'i.etsystatic.com' || url.username || url.password) {
        throw new Error('图片地址不在允许的 Etsy 图片域名内');
      }
      const response = await fetch(url, { credentials: 'omit', redirect: 'error', signal: controller.signal });
      const buffer = await readImageBytes(response);
      if (!controller.signal.aborted) port.postMessage({ buffer }, [buffer]);
    } catch (error) {
      port.postMessage({ error: controller.signal.aborted ? '图片下载超时或已取消' : error instanceof Error ? error.message : String(error) });
    } finally {
      controller.abort();
      clearTimeout(timer);
      port.close();
    }
  })();
});
