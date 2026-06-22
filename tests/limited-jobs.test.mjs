import assert from "node:assert/strict";
import { test } from "node:test";
import { runLimitedJobs } from "../lib/limited-jobs.mjs";

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
