export const KST_PROXY_PORT_NAME: string;
export const KST_PROXY_TRANSFER_VERSION: number;
export const KST_PROXY_CHUNK_SIZE: number;
export const KST_PROXY_PORT_MESSAGE_TYPES: {
  start: string;
  chunk: string;
  abort: string;
  result: string;
};

export function shouldUseKstProxyPortTransfer(
  formFile:
    | {
        blob?: Blob;
        base64?: string;
      }
    | null
    | undefined,
  options?: { base64Threshold?: number }
): boolean;

export function createKstProxyPortStartMessage(
  request: unknown,
  fileMeta: {
    fileName: string;
    mimeType?: string;
    fieldName?: string;
    byteLength: number;
    totalChunks: number;
  }
): unknown;

export function createKstProxyPortChunkMessage(
  index: number,
  bytes: Uint8Array
): { type: string; index: number; bytes: string };

export function createKstProxyPortAbortMessage(
  error: unknown
): { type: string; error: string };

export function getKstProxyChunkCount(
  byteLength: number,
  chunkSize?: number
): number;

export function createKstProxyChunkIterator(
  bytes: Uint8Array,
  chunkSize?: number
): Iterable<{ index: number; bytes: Uint8Array }>;

export function createKstProxyPortAssembler(fileMeta: {
  totalChunks: number;
  byteLength: number;
}): {
  totalChunks: number;
  byteLength: number;
  received(): number;
  add(index: number, bytes: unknown): void;
  isComplete(): boolean;
  assemble(): Uint8Array;
};
