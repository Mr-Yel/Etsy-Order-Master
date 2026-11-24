import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPodBackHeaders,
  PodBackApiError,
  resolvePodBackError,
  toPodBackApiError,
  unwrapPodBackData,
} from "../lib/podback-utils.mjs";

test("builds PodBack headers with API key and optional KST token", () => {
  const apiKeyOnly = buildPodBackHeaders("api-key", undefined, {
    "X-Trace-Id": "trace-1",
  });
  assert.equal(apiKeyOnly["x-api-key"], "api-key");
  assert.equal(apiKeyOnly["X-Trace-Id"], "trace-1");
  assert.equal(apiKeyOnly.Authorization, undefined);

  const withToken = buildPodBackHeaders("api-key", "kst-token");
  assert.equal(withToken["x-api-key"], "api-key");
  assert.equal(withToken.Authorization, "Bearer kst-token");
});

test("does not allow custom headers to replace PodBack credentials", () => {
  const headers = buildPodBackHeaders("real-key", "real-token", {
    "x-api-key": "wrong-key",
    "X-API-KEY": "another-wrong-key",
    Authorization: "Bearer wrong-token",
    authorization: "Bearer another-wrong-token",
  });

  assert.equal(headers["x-api-key"], "real-key");
  assert.equal(headers.Authorization, "Bearer real-token");
  assert.equal(headers["X-API-KEY"], undefined);
  assert.equal(headers.authorization, undefined);
});

test("unwraps PodBack envelopes and preserves raw payloads", () => {
  assert.deepEqual(
    unwrapPodBackData(
      { success: true, code: 200, data: { list: ["A"] } },
      "fallback"
    ),
    { list: ["A"] }
  );
  assert.deepEqual(
    unwrapPodBackData({ service: "pod-back", status: "ok" }, "fallback"),
    { service: "pod-back", status: "ok" }
  );
});

test("throws a typed PodBackApiError for failed envelopes", () => {
  assert.throws(
    () =>
      unwrapPodBackData(
        {
          success: false,
          code: 403,
          error: {
            type: "INVALID_API_KEY",
            message: "Invalid API key",
          },
        },
        "fallback"
      ),
    (error) => {
      assert.ok(error instanceof PodBackApiError);
      assert.equal(error.message, "Invalid API key");
      assert.equal(error.code, "INVALID_API_KEY");
      assert.equal(error.status, 403);
      assert.equal(error.type, "INVALID_API_KEY");
      return true;
    }
  );
});

test("resolves PodBack messages from legacy msg and message fields", () => {
  assert.deepEqual(resolvePodBackError({ code: 429, msg: "too many" }, "x"), {
    code: "429",
    status: 429,
    type: "",
    message: "too many",
  });
  assert.deepEqual(
    resolvePodBackError({ code: 500, message: "server error" }, "x"),
    {
      code: "500",
      status: 500,
      type: "",
      message: "server error",
    }
  );
});

test("normalizes proxy errors into PodBackApiError without losing status", () => {
  const error = toPodBackApiError(
    {
      message: "Invalid API key",
      code: 403,
      type: "INVALID_API_KEY",
    },
    "fallback"
  );

  assert.ok(error instanceof PodBackApiError);
  assert.equal(error.message, "Invalid API key");
  assert.equal(error.code, "INVALID_API_KEY");
  assert.equal(error.status, 403);
  assert.equal(error.type, "INVALID_API_KEY");
});
