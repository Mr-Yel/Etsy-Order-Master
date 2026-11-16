/** Limit applies to original bytes, including responses without Content-Length. */
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
export const IMAGE_BINARY_TIMEOUT_MS = 120_000;
export const IMAGE_BINARY_REQUEST = 'KST_IMAGE_BINARY_FETCH_V1';

export async function readImageBytes(response: Response): Promise<ArrayBuffer> {
  if (!response.ok) throw new Error(`图片下载失败 HTTP ${response.status}`);
  const tooLarge = () => new Error('图片超过单张 50 MiB 上限');
  if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) {
    await response.body?.cancel();
    throw tooLarge();
  }
  if (!response.body) throw new Error('图片内容为空');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!size) throw new Error('图片内容为空');
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}
