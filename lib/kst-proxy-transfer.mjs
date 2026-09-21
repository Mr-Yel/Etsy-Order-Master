export const KST_PROXY_PORT_NAME = "KST_PROXY_PORT";
export const KST_PROXY_TRANSFER_VERSION = 1;
export const KST_PROXY_CHUNK_SIZE = 4 * 1024 * 1024;

export const KST_PROXY_PORT_MESSAGE_TYPES = {
  start: "KST_PROXY_START",
  chunk: "KST_PROXY_CHUNK",
  abort: "KST_PROXY_ABORT",
  result: "KST_PROXY_RESULT",
};

export function shouldUseKstProxyPortTransfer(formFile, options = {}) {
  if (formFile == null) return false;
  if (formFile.blob != null) return true;
  if (typeof formFile.base64 === "string" && formFile.base64.length > 0) {
    const threshold =
      Number.isFinite(Number(options.base64Threshold))
        ? Number(options.base64Threshold)
        : 16 * 1024 * 1024;
    return formFile.base64.length >= threshold;
  }
  return false;
}

export function createKstProxyPortStartMessage(request, fileMeta) {
  return {
    type: KST_PROXY_PORT_MESSAGE_TYPES.start,
    version: KST_PROXY_TRANSFER_VERSION,
    request,
    file: fileMeta,
  };
}

export function bytesToBase64(bytes) {
  const chunkBytes =
    bytes instanceof Uint8Array
      ? bytes
      : bytes instanceof ArrayBuffer
        ? new Uint8Array(bytes)
        : null;
  if (chunkBytes == null) {
    throw new Error("分片内容无效");
  }
  let binary = "";
  const sliceSize = 0x8000;
  for (let i = 0; i < chunkBytes.length; i += sliceSize) {
    const slice = chunkBytes.subarray(i, i + sliceSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function base64ToBytes(base64) {
  if (typeof base64 !== "string") {
    throw new Error("分片内容无效");
  }
  if (base64.length === 0) return new Uint8Array(0);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function createKstProxyPortChunkMessage(index, bytes) {
  return {
    type: KST_PROXY_PORT_MESSAGE_TYPES.chunk,
    index,
    bytes: bytesToBase64(bytes),
  };
}

export function createKstProxyPortAbortMessage(error) {
  return {
    type: KST_PROXY_PORT_MESSAGE_TYPES.abort,
    error: error instanceof Error ? error.message : String(error ?? "传输已取消"),
  };
}

export function getKstProxyChunkCount(byteLength, chunkSize = KST_PROXY_CHUNK_SIZE) {
  const size = Number(byteLength);
  const chunk = Number(chunkSize);
  if (!Number.isFinite(size) || size < 0) {
    throw new Error("无效的文件大小");
  }
  if (!Number.isFinite(chunk) || chunk < 1) {
    throw new Error("无效的分片大小");
  }
  if (size === 0) return 1;
  return Math.ceil(size / chunk);
}

export function sliceBytes(bytes, index, chunkSize = KST_PROXY_CHUNK_SIZE) {
  const start = index * chunkSize;
  return bytes.subarray(start, start + chunkSize);
}

export function createKstProxyChunkIterator(bytes, chunkSize = KST_PROXY_CHUNK_SIZE) {
  const total = getKstProxyChunkCount(bytes.byteLength, chunkSize);
  return {
    total,
    *[Symbol.iterator]() {
      for (let index = 0; index < total; index += 1) {
        yield {
          index,
          bytes: sliceBytes(bytes, index, chunkSize),
        };
      }
    },
  };
}

function toUint8Array(bytes) {
  if (typeof bytes === "string") return base64ToBytes(bytes);
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (ArrayBuffer.isView(bytes)) {
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  return null;
}

export function createKstProxyPortAssembler(fileMeta) {
  const totalChunks = Number(fileMeta?.totalChunks);
  const byteLength = Number(fileMeta?.byteLength);
  if (!Number.isInteger(totalChunks) || totalChunks < 1) {
    throw new Error("无效的分片数量");
  }
  if (!Number.isInteger(byteLength) || byteLength < 0) {
    throw new Error("无效的文件大小");
  }

  const chunks = new Array(totalChunks);
  let received = 0;
  let receivedBytes = 0;

  return {
    totalChunks,
    byteLength,
    received() {
      return received;
    },
    add(index, bytes) {
      if (!Number.isInteger(index) || index < 0 || index >= totalChunks) {
        throw new Error(`分片序号无效: ${index}`);
      }
      if (chunks[index] != null) {
        throw new Error(`重复的分片: ${index}`);
      }
      const chunkBytes = toUint8Array(bytes);
      if (chunkBytes == null) {
        throw new Error(`分片内容无效: ${index}`);
      }
      if (receivedBytes + chunkBytes.byteLength > byteLength) {
        throw new Error("文件分片超出声明大小");
      }
      chunks[index] = chunkBytes;
      received += 1;
      receivedBytes += chunkBytes.byteLength;
    },
    isComplete() {
      return received === totalChunks;
    },
    assemble() {
      if (received !== totalChunks) {
        throw new Error(`文件分片不完整: ${received}/${totalChunks}`);
      }
      const merged = new Uint8Array(byteLength);
      let offset = 0;
      for (let index = 0; index < totalChunks; index += 1) {
        const chunk = chunks[index];
        if (chunk == null) {
          throw new Error(`缺失分片: ${index}`);
        }
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }
      if (offset !== byteLength) {
        throw new Error(`文件大小不匹配: ${offset}/${byteLength}`);
      }
      return merged;
    },
  };
}
