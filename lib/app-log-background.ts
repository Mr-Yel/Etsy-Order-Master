import {
  APP_LOG_SYSTEM_ORDER_NO,
  isAppLogEnabled,
  type AppLogEvent,
} from "@/lib/app-log";

const APP_LOG_BASE_URL = (import.meta.env.VITE_EOM_APP_LOG_BASE_URL ?? "").trim();
const APP_LOG_CLIENT_ID = (import.meta.env.VITE_EOM_APP_LOG_CLIENT_ID ?? "").trim();
const APP_LOG_CLIENT_SECRET = (
  import.meta.env.VITE_EOM_APP_LOG_CLIENT_SECRET ?? ""
).trim();
const APP_LOG_PATHNAME = "/api/logs";
const MAX_LOG_CONTENT_LENGTH = 4000;

type PreparedAppLogEntry = {
  orderNo: string;
  content: string;
};

type AppLogSender = {
  url?: string;
  origin?: string;
  frameId?: number;
  tab?: {
    id?: number;
  };
};

const textEncoder = new TextEncoder();
const runtimeSessionId = createNonce();
const pendingEntries: PreparedAppLogEntry[] = [];
let isDraining = false;
let cachedHmacKeyPromise: Promise<CryptoKey> | null = null;
let hasLoggedConfigWarning = false;

function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function sha256Hex(content: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(content));
  return toHex(digest);
}

async function getHmacKey(): Promise<CryptoKey> {
  if (!cachedHmacKeyPromise) {
    cachedHmacKeyPromise = crypto.subtle.importKey(
      "raw",
      textEncoder.encode(APP_LOG_CLIENT_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
  }
  return cachedHmacKeyPromise;
}

async function hmacSha256Hex(content: string): Promise<string> {
  const key = await getHmacKey();
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(content));
  return toHex(signature);
}

function truncateString(value: string, maxLength = MAX_LOG_CONTENT_LENGTH): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...(truncated)`;
}

function sanitizeForLog(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    return truncateString(value, 1200);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeForLog(item));
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncateString(value.message, 1200),
      stack: truncateString(value.stack ?? "", 1200),
    };
  }
  if (typeof value === "object") {
    const next: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      next[key] = sanitizeForLog(item);
    });
    return next;
  }
  return String(value);
}

function buildLogContent(
  payload: AppLogEvent,
  sender?: AppLogSender
): string {
  const content = {
    event: payload.event,
    source: payload.source ?? "",
    occurredAt: payload.occurredAt ?? new Date().toISOString(),
    runtimeSessionId,
    extensionRuntimeId: browser.runtime.id,
    senderUrl: sender?.url ?? "",
    senderOrigin: sender?.origin ?? "",
    senderTabId: sender?.tab?.id ?? null,
    senderFrameId: sender?.frameId ?? null,
    data: sanitizeForLog(payload.data ?? {}),
  };

  return truncateString(JSON.stringify(content));
}

function getNormalizedOrderNo(orderNo: AppLogEvent["orderNo"]): string {
  const normalizedOrderNo = String(orderNo ?? "").trim();
  return normalizedOrderNo || APP_LOG_SYSTEM_ORDER_NO;
}

async function signHeaders(body: PreparedAppLogEntry): Promise<Record<string, string>> {
  const timestamp = String(Date.now());
  const nonce = createNonce();
  const bodyHash = await sha256Hex(canonicalize(body));
  const canonicalQuery = canonicalize({});
  const signaturePayload = [
    "POST",
    APP_LOG_PATHNAME,
    canonicalQuery,
    timestamp,
    nonce,
    bodyHash,
  ].join("\n");

  const signature = await hmacSha256Hex(signaturePayload);

  return {
    "X-Client-Id": APP_LOG_CLIENT_ID,
    "X-Timestamp": timestamp,
    "X-Nonce": nonce,
    "X-Signature": signature,
  };
}

async function uploadEntry(entry: PreparedAppLogEntry): Promise<void> {
  const headers = await signHeaders(entry);
  const uploadUrl = `${APP_LOG_BASE_URL}${APP_LOG_PATHNAME}`;
  console.log("[APP-LOG] Uploading log entry", {
    orderNo: entry.orderNo,
    uploadUrl,
    contentLength: entry.content.length,
  });
  const response = await fetch(`${APP_LOG_BASE_URL}${APP_LOG_PATHNAME}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(entry),
  });

  console.log("[APP-LOG] Upload response received", {
    orderNo: entry.orderNo,
    status: response.status,
    ok: response.ok,
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    console.warn("[APP-LOG] Log upload failed", {
      status: response.status,
      statusText: response.statusText,
      orderNo: entry.orderNo,
      responseText: truncateString(responseText, 1000),
    });
  }
}

async function shouldUploadLogs(): Promise<boolean> {
  if (!APP_LOG_BASE_URL || !APP_LOG_CLIENT_ID || !APP_LOG_CLIENT_SECRET) {
    console.warn("[APP-LOG] Upload disabled by missing config", {
      hasBaseUrl: Boolean(APP_LOG_BASE_URL),
      hasClientId: Boolean(APP_LOG_CLIENT_ID),
      hasClientSecret: Boolean(APP_LOG_CLIENT_SECRET),
      uploadUrl: APP_LOG_BASE_URL
        ? `${APP_LOG_BASE_URL}${APP_LOG_PATHNAME}`
        : "",
    });
    if (!hasLoggedConfigWarning) {
      hasLoggedConfigWarning = true;
      console.warn(
        "[APP-LOG] Logging is disabled because base URL or signing credentials are missing"
      );
    }
    return false;
  }

  const enabled = await isAppLogEnabled();
  console.log("[APP-LOG] Upload gate evaluated", {
    enabled,
    hasBaseUrl: Boolean(APP_LOG_BASE_URL),
    hasClientId: Boolean(APP_LOG_CLIENT_ID),
    hasClientSecret: Boolean(APP_LOG_CLIENT_SECRET),
    uploadUrl: `${APP_LOG_BASE_URL}${APP_LOG_PATHNAME}`,
  });
  if (!enabled) {
    console.warn("[APP-LOG] Upload disabled by local toggle", {
      storageKey: "eomAppLogEnabled",
    });
  }
  return enabled;
}

async function drainQueue(): Promise<void> {
  if (isDraining) return;
  isDraining = true;

  try {
    while (pendingEntries.length > 0) {
      const currentEntry = pendingEntries.shift();
      if (!currentEntry) continue;
      try {
        // await uploadEntry(currentEntry);
      } catch (error) {
        console.warn("[APP-LOG] Failed to upload log entry", {
          orderNo: currentEntry.orderNo,
          error: sanitizeForLog(error),
        });
      }
    }
  } finally {
    isDraining = false;
  }
}

export async function enqueueAppLogFromEvent(
  payload: AppLogEvent,
  sender?: AppLogSender
): Promise<void> {
  /*
  if (!(await shouldUploadLogs())) {
    console.log("[APP-LOG] Skip enqueue because upload is disabled", {
      event: payload.event,
      orderNo: payload.orderNo ?? APP_LOG_SYSTEM_ORDER_NO,
    });
    return;
  }
  */

  const entry = {
    orderNo: getNormalizedOrderNo(payload.orderNo),
    content: buildLogContent(payload, sender),
  };
  /*
  pendingEntries.push(entry);
  console.log("[APP-LOG] Enqueued log entry", {
    event: payload.event,
    orderNo: entry.orderNo,
    queueSize: pendingEntries.length,
    senderUrl: sender?.url ?? "",
    senderOrigin: sender?.origin ?? "",
  });

  void drainQueue();
  */
}

export function logBackgroundRuntimeStarted(): void {
  void enqueueAppLogFromEvent({
    event: "extension_runtime_started",
    orderNo: APP_LOG_SYSTEM_ORDER_NO,
    source: "background",
    occurredAt: new Date().toISOString(),
    data: {
      runtimeId: browser.runtime.id,
      userAgent: navigator.userAgent,
    },
  });
}
