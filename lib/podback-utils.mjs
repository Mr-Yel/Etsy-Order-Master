export class PodBackApiError extends Error {
  constructor(message, code, status, type) {
    super(message);
    this.name = "PodBackApiError";
    this.code = code;
    this.status = status;
    this.type = type;
  }
}

export function resolvePodBackError(payload, fallback) {
  const envelope =
    payload && typeof payload === "object"
      ? payload
      : {};
  const error =
    envelope.error && typeof envelope.error === "object"
      ? envelope.error
      : {};
  const code = String(error.type || envelope.code || "");
  const status = Number(envelope.code) || 0;
  const message = String(
    error.message ||
      envelope.msg ||
      envelope.message ||
      fallback ||
      "PodBack request failed"
  );
  return {
    code,
    status,
    type: String(error.type || ""),
    message,
  };
}

export function unwrapPodBackData(payload, fallback) {
  if (
    payload &&
    typeof payload === "object" &&
    (Object.prototype.hasOwnProperty.call(payload, "success") ||
      Object.prototype.hasOwnProperty.call(payload, "data"))
  ) {
    if (payload.success === false) {
      const resolved = resolvePodBackError(payload, fallback);
      throw new PodBackApiError(
        resolved.message,
        resolved.code,
        resolved.status,
        resolved.type
      );
    }
    return payload.data;
  }
  return payload;
}

export function buildPodBackHeaders(
  apiKey,
  token,
  customHeaders = {}
) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(customHeaders || {}).filter(([name]) => {
      const normalizedName = String(name).trim().toLowerCase();
      return normalizedName !== "x-api-key" && normalizedName !== "authorization";
    })
  );
  const headers = {
    Accept: "application/json, text/plain, */*",
    ...normalizedHeaders,
    "x-api-key": String(apiKey || "").trim(),
  };
  if (typeof token === "string" && token.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  return headers;
}

export function toPodBackApiError(error, fallback) {
  if (error instanceof PodBackApiError) return error;

  const value =
    error && typeof error === "object"
      ? error
      : { message: String(error || "") };
  const code = String(value.type || value.code || "");
  const status =
    Number(value.status) ||
    (typeof value.code === "number" ? value.code : 0);
  return new PodBackApiError(
    String(value.message || fallback || "PodBack request failed"),
    code,
    status,
    String(value.type || "")
  );
}

export function createPodBackIdempotencyKey() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  return `podback-${Date.now().toString(16)}-${Math.random()
    .toString(16)
    .slice(2, 10)}`;
}
