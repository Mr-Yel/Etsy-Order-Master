const BFF_TEXT_MAX_LENGTH = 160;

export const ETSY_ORDER_CANCELLATION_BFF_PATH =
  "/bff/v1/kst/etsy-order-cancellations";
export const ETSY_ORDER_COMPLETION_BFF_PATH =
  "/bff/v1/kst/etsy-order-completions";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function normalizeId(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeText(value, maxLength = BFF_TEXT_MAX_LENGTH) {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  if (!text || text.length > maxLength || /[\u0000-\u001f\u007f]/.test(text)) {
    return undefined;
  }
  return text;
}

export function parseJsonObject(bodyText) {
  if (typeof bodyText !== "string" || !bodyText.trim()) return null;
  try {
    return asObject(JSON.parse(bodyText));
  } catch {
    return null;
  }
}

export function parseBatchCompleteRequest(bodyText) {
  if (typeof bodyText !== "string" || !bodyText.trim()) return [];

  let params;
  try {
    params = new URLSearchParams(bodyText);
  } catch {
    return [];
  }

  const byIndex = new Map();
  for (const [key, value] of params.entries()) {
    const match = key.match(/^orders\[(\d+)\]\[([^\]]+)\]$/);
    if (!match) continue;

    const [, index, field] = match;
    if (!byIndex.has(index)) byIndex.set(index, {});
    byIndex.get(index)[field] = value;
  }

  return Array.from(byIndex.entries())
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([, fields]) => {
      const orderId = normalizeId(fields.order_id);
      if (!orderId) return null;

      return {
        orderId,
        trackingNumber: normalizeText(fields.tracking_number),
        carrier: normalizeText(fields.carrier),
        otherCarrier: normalizeText(fields.other_carrier),
        note: normalizeText(fields.note),
        shipDate: normalizeText(fields.ship_date),
      };
    })
    .filter(Boolean);
}

export function resolveCompleteOrderCarrier(order) {
  if (order?.otherCarrier) return order.otherCarrier;
  if (order?.carrier && order.carrier !== "-1") return order.carrier;
  return undefined;
}

export function evaluateCancelOrderResponse(status, bodyText) {
  if (!Number.isInteger(status) || status < 200 || status >= 300) {
    return {
      success: false,
      reason: "http_not_2xx",
      httpStatus: status,
    };
  }

  const payload = parseJsonObject(bodyText);
  if (!payload) {
    return {
      success: false,
      reason: "invalid_json",
      httpStatus: status,
    };
  }

  const refundSuccess = asObject(payload.refund)?.success === true;
  const cancelSuccess = asObject(payload.cancel)?.success === true;
  if (!refundSuccess || !cancelSuccess) {
    return {
      success: false,
      reason: "refund_or_cancel_not_successful",
      httpStatus: status,
      refundSuccess,
      cancelSuccess,
    };
  }

  return {
    success: true,
    httpStatus: status,
    refundSuccess: true,
    cancelSuccess: true,
    refundReason: normalizeText(asObject(payload.refund)?.reason, 500),
    cancelReason: normalizeText(asObject(payload.cancel)?.reason, 500),
  };
}

export function evaluateBatchCompleteResponse(status, bodyText, requestedOrders) {
  if (!Number.isInteger(status) || status < 200 || status >= 300) {
    return {
      success: false,
      reason: "http_not_2xx",
      orders: [],
      failures: [],
    };
  }

  const payload = parseJsonObject(bodyText);
  if (!payload || !Array.isArray(payload.success) || !Array.isArray(payload.errors)) {
    return {
      success: false,
      reason: "invalid_response",
      orders: [],
      failures: [],
    };
  }

  const successIds = new Set(payload.success.map(normalizeId).filter(Boolean));
  const failedIds = new Set(
    payload.errors
      .map((item) => normalizeId(asObject(item)?.order_id ?? item))
      .filter(Boolean)
  );

  const orders = (Array.isArray(requestedOrders) ? requestedOrders : [])
    .filter(
      (order) =>
        order?.orderId &&
        successIds.has(order.orderId) &&
        !failedIds.has(order.orderId)
    )
    .map((order) => ({
      etsyOrderId: order.orderId,
      trackingNumber: order.trackingNumber,
      carrier: resolveCompleteOrderCarrier(order),
    }));

  return {
    success: orders.length > 0,
    reason: orders.length > 0 ? undefined : "no_successful_orders",
    orders,
    failures: Array.from(failedIds),
    successIds: Array.from(successIds),
  };
}

export function buildCancellationReason(bodyText) {
  return normalizeText(parseJsonObject(bodyText)?.cancellation_reason);
}

export function buildEtsyOrderSyncBffRequest(event) {
  const message = asObject(event);
  const payload = asObject(message?.payload);
  if (!message || !payload) return null;

  const requestId = normalizeId(payload.requestId);
  if (!requestId) return null;

  if (message.type === "etsy-order-cancel-confirmed") {
    const etsyOrderId = normalizeId(payload.etsyOrderId);
    const etsyResult = asObject(payload.etsyResult);
    if (!etsyOrderId || !etsyResult) return null;

    return {
      path: ETSY_ORDER_CANCELLATION_BFF_PATH,
      body: {
        requestId,
        etsyOrderId,
        ...(normalizeText(payload.cancellationReason)
          ? { cancellationReason: normalizeText(payload.cancellationReason) }
          : {}),
        etsyResult: {
          httpStatus: etsyResult.httpStatus,
          refundSuccess: etsyResult.refundSuccess,
          cancelSuccess: etsyResult.cancelSuccess,
        },
      },
    };
  }

  if (message.type === "etsy-order-complete-confirmed") {
    const orders = (Array.isArray(payload.orders) ? payload.orders : [])
      .map((order) => {
        const item = asObject(order);
        const etsyOrderId = normalizeId(item?.etsyOrderId);
        if (!etsyOrderId) return null;

        return {
          etsyOrderId,
          ...(normalizeText(item?.trackingNumber)
            ? { trackingNumber: normalizeText(item.trackingNumber) }
            : {}),
          ...(normalizeText(item?.carrier)
            ? { carrier: normalizeText(item.carrier) }
            : {}),
        };
      })
      .filter(Boolean);

    if (orders.length === 0) return null;
    return {
      path: ETSY_ORDER_COMPLETION_BFF_PATH,
      body: {
        requestId,
        orders,
      },
    };
  }

  return null;
}

export function evaluateEtsyOrderSyncBffResponse(response) {
  const envelope = asObject(response);
  if (!envelope) {
    return { accepted: false, error: "empty_response" };
  }
  if (envelope.success !== true || envelope.code !== 202) {
    return { accepted: false, error: "not_202" };
  }

  const data = asObject(envelope.data);
  if (data?.accepted !== true) {
    return { accepted: false, error: "not_accepted" };
  }

  return {
    accepted: true,
    jobId: normalizeId(data.jobId) || undefined,
    acceptedCount: Number.isInteger(data.acceptedCount)
      ? data.acceptedCount
      : undefined,
  };
}

export function resolveEtsyOrderSyncMode(isTestBuild, configuredMode) {
  if (isTestBuild) return "observe";
  return configuredMode === "submit" ? "submit" : "observe";
}
