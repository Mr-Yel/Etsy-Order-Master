import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

function createPageInjectHarness(channel = "production") {
  const messages = [];
  const listeners = {};
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
        status: 204,
        ok: true,
        clone() {
          return {
            text() {
              return Promise.resolve("");
            },
          };
        },
      });
    },
    XMLHttpRequest: function XMLHttpRequest() {},
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
    Uint8Array,
    atob,
    btoa,
    fetch: window.fetch,
    window,
  });

  const source = readFileSync(new URL("../public/page-inject.js", import.meta.url), "utf-8");
  vm.runInContext(source, context);

  return { messages, window };
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
