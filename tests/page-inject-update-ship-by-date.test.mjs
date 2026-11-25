import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

function createPageInjectHarness(channel = "production", options = {}) {
  const messages = [];
  const listeners = {};
  const responseSpec = options.response ?? {
    status: 204,
    ok: true,
    body: "",
  };
  const xhrResponseSpec = options.xhrResponse ?? responseSpec;
  const xhrRequests = [];

  class MockXMLHttpRequest {
    constructor() {
      this.status = 0;
      this.responseText = "";
      this.responseType = "";
      this.response = null;
      this.listeners = new Map();
    }

    open(method, url) {
      this.method = method;
      this.url = url;
    }

    send(body) {
      xhrRequests.push({
        method: this.method,
        url: this.url,
        body,
      });
      this.status = xhrResponseSpec.status;
      this.responseText = xhrResponseSpec.body;
      this.responseType = xhrResponseSpec.responseType ?? "";
      this.response = xhrResponseSpec.response ?? null;
      for (const listener of this.listeners.get("loadend") ?? []) {
        listener();
      }
    }

    addEventListener(type, handler) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(handler);
    }
  }

  const window = {
    location: {
      origin: "https://www.etsy.com",
    },
    Etsy: {
      Context: {
        data: {
          shop_id: 26833914,
          order_states: [],
        },
      },
    },
    postMessage(message) {
      messages.push(message);
    },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    fetch() {
      return Promise.resolve({
        status: responseSpec.status,
        ok: responseSpec.ok,
        clone() {
          return {
            text() {
              return Promise.resolve(responseSpec.body);
            },
          };
        },
      });
    },
    XMLHttpRequest: MockXMLHttpRequest,
  };
  window.window = window;

  const context = vm.createContext({
    URL,
    console,
    document: {
      currentScript: {
        src: `chrome-extension://extension-id/page-inject.js?eom_channel=${channel}`,
      },
      querySelector() {
        return null;
      },
      getElementsByName() {
        return [];
      },
    },
    Event,
    FormData,
    Blob,
    URLSearchParams,
    Uint8Array,
    atob,
    btoa,
    setTimeout,
    fetch: window.fetch,
    window,
  });

  const source = readFileSync(new URL("../public/page-inject.js", import.meta.url), "utf-8");
  vm.runInContext(source, context);

  return { messages, window, xhrRequests };
}

test("page-inject emits request and response events for update-ship-by-date fetch calls", async () => {
  const { messages, window } = createPageInjectHarness();

  await window.fetch(
    "https://www.etsy.com/api/v3/ajax/shop/26833914/mission-control/orders/fulfillment/update-ship-by-date/4068847770",
    {
      method: "POST",
      body: JSON.stringify({
        new_ship_by_date: 1780675140,
        note_subject: "Order Update",
      }),
    }
  );

  const directMessages = messages.filter((message) =>
    String(message?.type ?? "").startsWith("etsy-update-ship-by-date-")
  );
  const bridgeEvents = messages.filter(
    (message) => message?.type === "ETSY_BRIDGE_EVENT"
  );

  assert.equal(directMessages.length, 2);
  assert.equal(directMessages[0].type, "etsy-update-ship-by-date-request");
  assert.equal(directMessages[0].orderId, "4068847770");
  assert.equal(directMessages[0].newShipByDate, 1780675140);
  assert.equal(directMessages[1].type, "etsy-update-ship-by-date-response");
  assert.equal(directMessages[1].status, 204);
  assert.equal(directMessages[1].ok, true);

  assert.equal(
    bridgeEvents.some(
      (message) =>
        message.event === "updateShipByDate.requested" &&
        message.payload.orderId === "4068847770" &&
        message.payload.newShipByDate === 1780675140
    ),
    true
  );
  assert.equal(
    bridgeEvents.some(
      (message) =>
        message.event === "updateShipByDate.responded" &&
        message.payload.orderId === "4068847770" &&
        message.payload.newShipByDate === 1780675140
    ),
    true
  );
});

test("page-inject isolates test mode events from production mode", async () => {
  const { messages, window } = createPageInjectHarness("test");

  await window.fetch(
    "https://www.etsy.com/api/v3/ajax/shop/26833914/mission-control/orders/fulfillment/update-ship-by-date/4068847770",
    {
      method: "POST",
      body: JSON.stringify({ new_ship_by_date: 1780675140 }),
    }
  );

  assert.equal(
    messages.some(
      (message) => message?.type === "etsy-update-ship-by-date-request_TEST"
    ),
    true
  );
  assert.equal(
    messages.some(
      (message) => message?.type === "etsy-update-ship-by-date-response_TEST"
    ),
    true
  );
  assert.equal(
    messages.some((message) => message?.type === "ETSY_BRIDGE_EVENT_TEST"),
    true
  );
  assert.equal(
    messages.some((message) => message?.type === "ETSY_BRIDGE_EVENT"),
    false
  );
});

test("page-inject emits cancel-order bridge events without legacy messages", async () => {
  const { messages, window } = createPageInjectHarness("production", {
    response: {
      status: 200,
      ok: true,
      body: JSON.stringify({
        refund: { success: true, reason: "" },
        cancel: { success: true, reason: "" },
      }),
    },
  });

  await window.fetch(
    "https://www.etsy.com/api/v3/ajax/shop/26724826/order/refund-and-cancel/4237878202",
    {
      method: "POST",
      body: JSON.stringify({
        cancellation_reason:
          "Buyerandshopowneragreedtocanceltransaction",
        message_to_buyer: "test",
        was_item_returned: false,
      }),
    }
  );

  const requestEvent = messages.find(
    (message) =>
      message?.type === "ETSY_BRIDGE_EVENT" &&
      message.event === "cancelOrder.requested"
  );
  const responseEvent = messages.find(
    (message) =>
      message?.type === "ETSY_BRIDGE_EVENT" &&
      message.event === "cancelOrder.responded"
  );

  assert.equal(requestEvent?.payload.shopId, "26724826");
  assert.equal(requestEvent?.payload.orderId, "4237878202");
  assert.equal(requestEvent?.payload.source, "page-inject");
  assert.equal(requestEvent?.meta.source, "page");
  assert.equal(responseEvent?.payload.shopId, "26724826");
  assert.equal(responseEvent?.payload.orderId, "4237878202");
  assert.equal(
    messages.some((message) =>
      String(message?.type ?? "").startsWith("etsy-cancel-order-")
    ),
    false
  );
});

test("page-inject emits batch-complete bridge events", async () => {
  const { messages, window } = createPageInjectHarness("production", {
    response: {
      status: 200,
      ok: true,
      body: JSON.stringify({
        success: [4237878202],
        errors: [],
      }),
    },
  });

  const body = new URLSearchParams({
    "orders[0][order_id]": "4237878202",
    "orders[0][tracking_number]": "YT2640321437765373",
    "orders[0][carrier]": "-1",
    "orders[0][other_carrier]": "YunExpress",
  }).toString();

  await window.fetch(
    "https://www.etsy.com/api/v3/ajax/bespoke/shop/63724694/mission-control/order-state/batch-complete",
    {
      method: "POST",
      body,
    }
  );

  const requestEvent = messages.find(
    (message) =>
      message?.type === "ETSY_BRIDGE_EVENT" &&
      message.event === "batchComplete.requested"
  );
  const responseEvent = messages.find(
    (message) =>
      message?.type === "ETSY_BRIDGE_EVENT" &&
      message.event === "batchComplete.responded"
  );

  assert.equal(requestEvent?.payload.shopId, "63724694");
  assert.equal(requestEvent?.payload.body, body);
  assert.equal(responseEvent?.payload.shopId, "63724694");
  assert.deepEqual(JSON.parse(responseEvent?.payload.body ?? "{}").success, [
    4237878202,
  ]);
});

test("page-inject wraps batch-complete XMLHttpRequest calls", async () => {
  const { messages, window, xhrRequests } = createPageInjectHarness(
    "production",
    {
      xhrResponse: {
        status: 200,
        ok: true,
        body: JSON.stringify({
          success: [4237878202],
          errors: [],
        }),
      },
    }
  );
  const body = new URLSearchParams({
    "orders[0][order_id]": "4237878202",
    "orders[0][tracking_number]": "YT2640321437765373",
    "orders[0][carrier]": "-1",
    "orders[0][other_carrier]": "YunExpress",
  }).toString();

  await new Promise((resolve) => {
    const xhr = new window.XMLHttpRequest();
    xhr.open(
      "POST",
      "https://www.etsy.com/api/v3/ajax/bespoke/shop/63724694/mission-control/order-state/batch-complete"
    );
    xhr.addEventListener("loadend", resolve);
    xhr.send(body);
  });

  assert.equal(xhrRequests.length, 1);
  assert.equal(xhrRequests[0].body, body);
  assert.equal(
    messages.some(
      (message) =>
        message?.type === "ETSY_BRIDGE_EVENT" &&
        message.event === "batchComplete.requested" &&
        message.payload.shopId === "63724694"
    ),
    true
  );
  assert.equal(
    messages.some(
      (message) =>
        message?.type === "ETSY_BRIDGE_EVENT" &&
        message.event === "batchComplete.responded" &&
        message.payload.status === 200
    ),
    true
  );
});

test("page-inject reads cancellation response from XHR json responseType", async () => {
  const responseBody = {
    refund: { success: true, reason: "" },
    cancel: { success: true, reason: "" },
  };
  const { messages, window } = createPageInjectHarness("production", {
    xhrResponse: {
      status: 200,
      ok: true,
      body: "",
      responseType: "json",
      response: responseBody,
    },
  });

  await new Promise((resolve) => {
    const xhr = new window.XMLHttpRequest();
    xhr.open(
      "POST",
      "https://www.etsy.com/api/v3/ajax/shop/26724826/order/refund-and-cancel/4237878202"
    );
    xhr.addEventListener("loadend", resolve);
    xhr.send(
      JSON.stringify({
        cancellation_reason:
          "Buyerandshopowneragreedtocanceltransaction",
      })
    );
  });

  const responseEvent = messages.find(
    (message) =>
      message?.type === "ETSY_BRIDGE_EVENT" &&
      message.event === "cancelOrder.responded"
  );
  assert.deepEqual(JSON.parse(responseEvent?.payload.body ?? "{}"), responseBody);
});
