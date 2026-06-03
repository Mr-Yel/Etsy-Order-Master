import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendShipByDateLog,
  formatChinaDateTimeFromUnixSeconds,
} from "../lib/kst-ship-by-date-sync-utils.mjs";

test("formats Etsy ship-by-date Unix seconds as China local time", () => {
  assert.equal(
    formatChinaDateTimeFromUnixSeconds(1780675140),
    "2026-06-05 23:59:00"
  );
});

test("appends ship-by-date log to empty errorInfo", () => {
  const result = appendShipByDateLog({
    errorInfo: null,
    platformOrderId: "4068847770",
    latestDeliveryTime: "2026-06-05 23:59:00",
    now: 1780675200123,
    randomIdPart: "abc123",
  });

  const parsed = JSON.parse(result);
  assert.equal(parsed.data.length, 1);
  assert.deepEqual(parsed.data[0], {
    type: "success",
    info: "[Etsy修改最晚发货时间] 已同步 Etsy 最新发货时间：2026-06-05 23:59:00",
    source: "etsy-update-ship-by-date",
    stage: "update-latest-delivery-time",
    scopeId: "etsy-update-ship-by-date",
    dedupeKey:
      "etsy-update-ship-by-date|update-latest-delivery-time|success|4068847770|2026-06-05 23:59:00",
    id: "1780675200123-abc123",
    timestamp: 1780675200123,
  });
});

test("appends ship-by-date log after existing errorInfo data", () => {
  const existing = {
    data: [
      {
        type: "success",
        info: "existing",
        source: "existing-source",
        stage: "existing-stage",
        scopeId: "existing-scope",
        dedupeKey: "existing-key",
        id: "existing-id",
        timestamp: 1,
      },
    ],
  };

  const result = appendShipByDateLog({
    errorInfo: JSON.stringify(existing),
    platformOrderId: "4068847770",
    latestDeliveryTime: "2026-06-05 23:59:00",
    now: 1780675200123,
    randomIdPart: "abc123",
  });

  const parsed = JSON.parse(result);
  assert.equal(parsed.data.length, 2);
  assert.equal(parsed.data[0].info, "existing");
  assert.equal(parsed.data[1].source, "etsy-update-ship-by-date");
});
