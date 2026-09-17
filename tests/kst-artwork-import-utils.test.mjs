import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ARTWORK_PACKAGE_ROOT_PATH,
  buildArtworkImportFormFields,
} from "../lib/kst-artwork-import-utils.mjs";

test("builds the fixed Etsy artwork import fields", () => {
  const fields = buildArtworkImportFormFields(
    { shopId: "26833914", ownerUserId: 42 },
    () => "f373af25-a9a6-4756-a427-f60410f6c838"
  );

  assert.deepEqual(fields, {
    shopId: "26833914",
    ownerUserId: "42",
    forceReimport: "true",
    artworkRequestId: "f373af25-a9a6-4756-a427-f60410f6c838",
    packageRootPath: ARTWORK_PACKAGE_ROOT_PATH,
  });
  assert.equal("platformType" in fields, false);
});

test("omits an invalid owner user ID", () => {
  const fields = buildArtworkImportFormFields(
    { shopId: 26833914, ownerUserId: Number.NaN },
    () => "request-id"
  );

  assert.equal(fields.shopId, "26833914");
  assert.equal("ownerUserId" in fields, false);
});
