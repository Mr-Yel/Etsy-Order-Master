import assert from "node:assert/strict";
import test from "node:test";
import {
  getUspsRemotePostalPrefix,
  isUspsRemotePostalCode,
  USPS_REMOTE_POSTAL_PREFIXES,
} from "../lib/usps-remote-area-utils.mjs";

test("matches every configured USPS remote postal prefix", () => {
  for (const prefix of USPS_REMOTE_POSTAL_PREFIXES) {
    assert.equal(isUspsRemotePostalCode(`${prefix}01`), true, prefix);
  }
});

test("supports ZIP+4 and trims surrounding whitespace", () => {
  assert.equal(getUspsRemotePostalPrefix(" 99501-1234 "), "995");
  assert.equal(getUspsRemotePostalPrefix("006 01"), "006");
});

test("does not match ordinary or incomplete postal codes", () => {
  assert.equal(isUspsRemotePostalCode("10001"), false);
  assert.equal(isUspsRemotePostalCode("99"), false);
  assert.equal(isUspsRemotePostalCode("ABC99"), false);
  assert.equal(isUspsRemotePostalCode(null), false);
});
