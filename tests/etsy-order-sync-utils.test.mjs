import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCancellationReason,
  buildEtsyOrderSyncBffRequest,
  evaluateBatchCompleteResponse,
  evaluateCancelOrderResponse,
  evaluateEtsyOrderSyncBffResponse,
  ETSY_ORDER_CANCELLATION_BFF_PATH,
  ETSY_ORDER_COMPLETION_BFF_PATH,
  parseBatchCompleteRequest,
  resolveCompleteOrderCarrier,
  resolveEtsyOrderSyncMode,
} from "../lib/etsy-order-sync-utils.mjs";

test("parseBatchCompleteRequest groups form fields by order index", () => {
  const body = new URLSearchParams({
    "orders[1][order_id]": "4237878203",
    "orders[1][tracking_number]": "TRACK-2",
    "orders[0][order_id]": "4237878202",
    "orders[0][tracking_number]": "TRACK-1",
    "orders[0][carrier]": "-1",
    "orders[0][other_carrier]": "YunExpress",
  }).toString();

  const orders = parseBatchCompleteRequest(body);
  assert.equal(orders.length, 2);
  assert.equal(orders[0].orderId, "4237878202");
  assert.equal(orders[0].trackingNumber, "TRACK-1");
  assert.equal(orders[1].orderId, "4237878203");
  assert.equal(resolveCompleteOrderCarrier(orders[0]), "YunExpress");
});

test("cancel response requires both refund and cancel success", () => {
  const partial = evaluateCancelOrderResponse(
    200,
    JSON.stringify({
      refund: { success: true },
      cancel: { success: false, reason: "failed" },
    })
  );
  assert.equal(partial.success, false);
  assert.equal(partial.reason, "refund_or_cancel_not_successful");

  const confirmed = evaluateCancelOrderResponse(
    200,
    JSON.stringify({
      refund: { success: true, reason: "" },
      cancel: { success: true, reason: "" },
    })
  );
  assert.equal(confirmed.success, true);
  assert.equal(confirmed.httpStatus, 200);
});

test("batch completion returns only confirmed successful orders", () => {
  const requestedOrders = parseBatchCompleteRequest(
    new URLSearchParams({
      "orders[0][order_id]": "4237878202",
      "orders[0][tracking_number]": "TRACK-1",
      "orders[0][carrier]": "USPS",
      "orders[1][order_id]": "4237878203",
      "orders[1][tracking_number]": "TRACK-2",
      "orders[2][order_id]": "4237878204",
      "orders[2][tracking_number]": "TRACK-3",
    }).toString()
  );

  const result = evaluateBatchCompleteResponse(
    200,
    JSON.stringify({
      success: [4237878202, 4237878204],
      errors: [{ order_id: 4237878204, message: "failed" }],
    }),
    requestedOrders
  );

  assert.equal(result.success, true);
  assert.deepEqual(result.orders, [
    {
      etsyOrderId: "4237878202",
      trackingNumber: "TRACK-1",
      carrier: "USPS",
    },
  ]);
});

test("batch completion rejects invalid and non-2xx responses", () => {
  assert.equal(evaluateBatchCompleteResponse(200, "not-json", []).success, false);
  assert.equal(
    evaluateBatchCompleteResponse(
      500,
      JSON.stringify({ success: [], errors: [] }),
      []
    ).success,
    false
  );
});

test("cancellation reason is read from the Etsy JSON body", () => {
  assert.equal(
    buildCancellationReason(
      JSON.stringify({
        cancellation_reason:
          "Buyerandshopowneragreedtocanceltransaction",
      })
    ),
    "Buyerandshopowneragreedtocanceltransaction"
  );
});

test("test builds can never resolve to submit mode", () => {
  assert.equal(resolveEtsyOrderSyncMode(true, "submit"), "observe");
  assert.equal(resolveEtsyOrderSyncMode(false, "submit"), "submit");
  assert.equal(resolveEtsyOrderSyncMode(false, "observe"), "observe");
  assert.equal(resolveEtsyOrderSyncMode(false, undefined), "observe");
});

test("builds the cancellation BFF request without internal event fields", () => {
  const request = buildEtsyOrderSyncBffRequest({
    type: "etsy-order-cancel-confirmed",
    payload: {
      requestId: "etsy-cancel-001",
      shopId: "26724826",
      etsyOrderId: "4237878202",
      cancellationReason:
        "Buyerandshopowneragreedtocanceltransaction",
      etsyResult: {
        httpStatus: 200,
        refundSuccess: true,
        cancelSuccess: true,
      },
      occurredAt: "2026-11-25T08:00:00.000Z",
      pageUrl: "https://www.etsy.com/your/orders/4237878202",
    },
  });

  assert.equal(request.path, ETSY_ORDER_CANCELLATION_BFF_PATH);
  assert.deepEqual(request.body, {
    requestId: "etsy-cancel-001",
    etsyOrderId: "4237878202",
    cancellationReason:
      "Buyerandshopowneragreedtocanceltransaction",
    etsyResult: {
      httpStatus: 200,
      refundSuccess: true,
      cancelSuccess: true,
    },
  });
});

test("builds the completion BFF request with order tracking details", () => {
  const request = buildEtsyOrderSyncBffRequest({
    type: "etsy-order-complete-confirmed",
    payload: {
      requestId: "etsy-complete-001",
      shopId: "63724694",
      orders: [
        {
          etsyOrderId: "4237878202",
          trackingNumber: "TRACK-1",
          carrier: "YunExpress",
        },
        { etsyOrderId: "4237878203" },
      ],
      occurredAt: "2026-11-25T08:00:00.000Z",
      pageUrl: "https://www.etsy.com/your/orders/sold/all",
    },
  });

  assert.equal(request.path, ETSY_ORDER_COMPLETION_BFF_PATH);
  assert.deepEqual(request.body, {
    requestId: "etsy-complete-001",
    orders: [
      {
        etsyOrderId: "4237878202",
        trackingNumber: "TRACK-1",
        carrier: "YunExpress",
      },
      { etsyOrderId: "4237878203" },
    ],
  });
});

test("BFF response is accepted only for a 202 accepted envelope", () => {
  assert.deepEqual(
    evaluateEtsyOrderSyncBffResponse({
      success: true,
      code: 202,
      data: {
        accepted: true,
        jobId: "job-001",
        acceptedCount: 2,
      },
    }),
    {
      accepted: true,
      jobId: "job-001",
      acceptedCount: 2,
    }
  );

  assert.equal(
    evaluateEtsyOrderSyncBffResponse({
      success: true,
      code: 200,
      data: { accepted: true },
    }).accepted,
    false
  );
  assert.equal(
    evaluateEtsyOrderSyncBffResponse({
      success: true,
      code: 202,
      data: { accepted: false },
    }).accepted,
    false
  );
});
