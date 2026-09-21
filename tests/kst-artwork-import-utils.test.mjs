import assert from "node:assert/strict";
import { test } from "node:test";
import { buildArtworkImportFormFields } from "../lib/kst-artwork-import-utils.mjs";

test("builds the minimal Etsy order import fields", () => {
  const fields = buildArtworkImportFormFields({
    shopId: "26833914",
    ownerUserId: 42,
  });

  assert.deepEqual(fields, {
    shopId: "26833914",
    ownerUserId: "42",
  });
  assert.equal("platformType" in fields, false);
  assert.equal("forceReimport" in fields, false);
  assert.equal("artworkRequestId" in fields, false);
  assert.equal("packageRootPath" in fields, false);
});

test("omits an invalid owner user ID", () => {
  const fields = buildArtworkImportFormFields({
    shopId: 26833914,
    ownerUserId: Number.NaN,
  });

  assert.equal(fields.shopId, "26833914");
  assert.equal("ownerUserId" in fields, false);
});
