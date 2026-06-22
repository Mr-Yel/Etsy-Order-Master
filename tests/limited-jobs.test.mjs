import assert from "node:assert/strict";
import { test } from "node:test";
import { runLimitedJobs, runWithRetry } from "../lib/limited-jobs.mjs";

test("runs jobs with the configured concurrency limit", async () => {
  let active = 0;
  let maxActive = 0;

  const results = await runLimitedJobs(
    [1, 2, 3, 4, 5],
    async (value) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return value * 10;
    },
    { concurrency: 2 }
  );

  assert.equal(maxActive, 2);
  assert.deepEqual(
    results.map((result) => result.success && result.value),
    [10, 20, 30, 40, 50]
  );
});

test("records failed jobs and continues processing remaining jobs", async () => {
  const progress = [];

  const results = await runLimitedJobs(
    ["a", "bad", "c"],
    async (value) => {
      if (value === "bad") {
        throw new Error("download failed");
      }
      return value.toUpperCase();
    },
    {
      concurrency: 2,
      onProgress(snapshot) {
        progress.push(snapshot.completed);
      },
    }
  );

  assert.deepEqual(results, [
    { success: true, value: "A" },
    { success: false, error: "download failed" },
    { success: true, value: "C" },
  ]);
  assert.deepEqual(progress, [1, 2, 3]);
});

test("retries retryable operations before succeeding", async () => {
  let attempts = 0;

  const result = await runWithRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("message channel closed before a response was received");
      }
      return "ok";
    },
    {
      retries: 2,
      shouldRetry(error) {
        return String(error).includes("message channel closed");
      },
    }
  );

  assert.equal(result, "ok");
  assert.equal(attempts, 3);
});

test("does not retry non-retryable operations", async () => {
  let attempts = 0;

  await assert.rejects(
    runWithRetry(
      async () => {
        attempts += 1;
        throw new Error("permanent failure");
      },
      {
        retries: 2,
        shouldRetry(error) {
          return String(error).includes("message channel closed");
        },
      }
    ),
    /permanent failure/
  );

  assert.equal(attempts, 1);
});
