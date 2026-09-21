/**
 * KST 接口代理 — 大文件 Port 分片传输
 * sendMessage JSON 有约 64MB 限制，带 blob / 过大 base64 的请求走这条通道
 */
import { browser } from "wxt/browser";
import { runKstProxyInBackground } from "./kst-proxy";
import type {
  KstProxyRequest,
  KstProxyResponse,
  KstProxySerializableRequest,
} from "./kst-proxy-types";
import {
  KST_PROXY_CHUNK_SIZE,
  KST_PROXY_PORT_MESSAGE_TYPES,
  KST_PROXY_PORT_NAME,
  createKstProxyChunkIterator,
  createKstProxyPortAbortMessage,
  createKstProxyPortAssembler,
  createKstProxyPortChunkMessage,
  createKstProxyPortStartMessage,
  getKstProxyChunkCount,
} from "./kst-proxy-transfer.mjs";

function toSerializableRequest(req: KstProxyRequest): KstProxySerializableRequest {
  if (req.formFile == null) return req;
  const { blob: _blob, base64: _base64, ...formFile } = req.formFile;
  return { ...req, formFile };
}

async function formFileToBytes(
  formFile: NonNullable<KstProxyRequest["formFile"]>
): Promise<Uint8Array> {
  if (formFile.blob != null) {
    return new Uint8Array(await formFile.blob.arrayBuffer());
  }
  if (typeof formFile.base64 === "string" && formFile.base64.length > 0) {
    const binary = atob(formFile.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  throw new Error("缺少上传文件内容");
}

type RuntimePort = {
  name: string;
  postMessage: (message: unknown) => void;
  disconnect?: () => void;
  onMessage: {
    addListener: (cb: (msg: unknown) => void) => void;
    removeListener?: (cb: (msg: unknown) => void) => void;
  };
  onDisconnect: {
    addListener: (cb: () => void) => void;
    removeListener?: (cb: () => void) => void;
  };
};

function waitForPortResult(port: RuntimePort): Promise<KstProxyResponse> {
  return new Promise((resolve, reject) => {
    const onMessage = (msg: unknown) => {
      const payload = msg as { type?: string } & KstProxyResponse;
      if (payload?.type !== KST_PROXY_PORT_MESSAGE_TYPES.result) return;
      cleanup();
      resolve(payload);
    };
    const onDisconnect = () => {
      cleanup();
      const err = browser.runtime.lastError?.message;
      reject(new Error(err || "KST 代理传输已断开"));
    };
    const cleanup = () => {
      port.onMessage.removeListener?.(onMessage);
      port.onDisconnect.removeListener?.(onDisconnect);
    };
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
  });
}

export async function sendKstProxyRequestViaPort(
  req: KstProxyRequest
): Promise<KstProxyResponse> {
  const formFile = req.formFile;
  if (formFile == null) {
    throw new Error("Port 传输需要 formFile");
  }

  const bytes = await formFileToBytes(formFile);
  const totalChunks = getKstProxyChunkCount(bytes.byteLength);
  const port = browser.runtime.connect({ name: KST_PROXY_PORT_NAME }) as RuntimePort;
  const resultPromise = waitForPortResult(port);

  try {
    port.postMessage(
      createKstProxyPortStartMessage(toSerializableRequest(req), {
        fileName: formFile.fileName,
        mimeType: formFile.mimeType,
        fieldName: formFile.fieldName,
        byteLength: bytes.byteLength,
        totalChunks,
      })
    );
    for (const chunk of createKstProxyChunkIterator(bytes, KST_PROXY_CHUNK_SIZE)) {
      port.postMessage(createKstProxyPortChunkMessage(chunk.index, chunk.bytes));
    }
    return await resultPromise;
  } catch (error) {
    try {
      port.postMessage(createKstProxyPortAbortMessage(error));
    } catch {
      // ignore
    }
    throw error;
  } finally {
    // 等 result 回来后再断开，避免 background 还在拼包/上传时通道被关
    try {
      port.disconnect?.();
    } catch {
      // ignore
    }
  }
}

export type KstProxyPortConnectionOptions = {
  onUnauthorized?: (body: { code?: number; msg?: string }) => Promise<KstProxyResponse>;
};

export function handleKstProxyPortConnection(
  port: RuntimePort,
  options: KstProxyPortConnectionOptions = {}
): void {
  if (port.name !== KST_PROXY_PORT_NAME) return;

  let assembler: ReturnType<typeof createKstProxyPortAssembler> | null = null;
  let request: KstProxySerializableRequest | null = null;
  let fileMeta: {
    fileName: string;
    mimeType?: string;
    fieldName?: string;
    byteLength: number;
    totalChunks: number;
  } | null = null;
  let settled = false;

  const respond = (payload: KstProxyResponse) => {
    if (settled) return;
    settled = true;
    try {
      port.postMessage({
        type: KST_PROXY_PORT_MESSAGE_TYPES.result,
        ...payload,
      });
    } catch {
      // ignore
    }
  };

  const fail = (error: unknown) => {
    respond({
      success: false,
      error:
        error instanceof Error ? error.message : String(error ?? "KST 代理传输失败"),
    });
  };

  const runUpload = async (bytes: Uint8Array) => {
    if (request == null || fileMeta == null) {
      throw new Error("缺少上传元数据");
    }
    const blob = new Blob([bytes], {
      type: fileMeta.mimeType ?? "application/octet-stream",
    });
    const data = await runKstProxyInBackground({
      ...request,
      formFile: {
        blob,
        fileName: fileMeta.fileName,
        mimeType: fileMeta.mimeType,
        fieldName: fileMeta.fieldName,
      },
    });
    const body = data as { code?: number; msg?: string };
    if (body?.code === 401 && options.onUnauthorized) {
      respond(await options.onUnauthorized(body));
      return;
    }
    if (body?.code === 401) {
      respond({
        success: false,
        error: body?.msg ?? "登录已过期",
        code: 401,
      });
      return;
    }
    respond({ success: true, data });
  };

  const onMessage = (msg: unknown) => {
    if (settled) return;
    const payload = msg as {
      type?: string;
      request?: KstProxySerializableRequest;
      file?: typeof fileMeta;
      index?: number;
      bytes?: ArrayBuffer | Uint8Array | string;
      error?: string;
    };

    try {
      if (payload?.type === KST_PROXY_PORT_MESSAGE_TYPES.abort) {
        fail(payload.error ?? "传输已取消");
        return;
      }

      if (payload?.type === KST_PROXY_PORT_MESSAGE_TYPES.start) {
        if (assembler != null) {
          throw new Error("重复的传输开始消息");
        }
        request = payload.request ?? null;
        fileMeta = payload.file ?? null;
        if (request == null || fileMeta == null) {
          throw new Error("缺少传输开始数据");
        }
        assembler = createKstProxyPortAssembler(fileMeta);
        return;
      }

      if (payload?.type === KST_PROXY_PORT_MESSAGE_TYPES.chunk) {
        if (assembler == null) {
          throw new Error("未开始的文件传输");
        }
        assembler.add(payload.index ?? -1, payload.bytes);
        if (assembler.isComplete()) {
          const bytes = assembler.assemble();
          void runUpload(bytes).catch(fail);
        }
      }
    } catch (error) {
      fail(error);
    }
  };

  port.onMessage.addListener(onMessage);
  port.onDisconnect.addListener(() => {
    if (!settled) fail("KST 代理传输已断开");
  });
}
