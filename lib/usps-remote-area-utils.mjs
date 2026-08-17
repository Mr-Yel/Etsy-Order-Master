export const USPS_REMOTE_POSTAL_PREFIXES = Object.freeze([
  "006",
  "007",
  "008",
  "009",
  "090",
  "091",
  "092",
  "093",
  "094",
  "095",
  "096",
  "097",
  "098",
  "099",
  "340",
  "962",
  "963",
  "964",
  "965",
  "966",
  "967",
  "968",
  "969",
  "995",
  "996",
  "997",
  "998",
  "999",
]);

const USPS_REMOTE_POSTAL_PREFIX_SET = new Set(USPS_REMOTE_POSTAL_PREFIXES);

export function getUspsRemotePostalPrefix(postalCode) {
  const normalized = String(postalCode ?? "").trim().replace(/\s+/g, "");
  const prefix = normalized.slice(0, 3);
  return /^\d{3}$/.test(prefix) && USPS_REMOTE_POSTAL_PREFIX_SET.has(prefix)
    ? prefix
    : null;
}

export function isUspsRemotePostalCode(postalCode) {
  return getUspsRemotePostalPrefix(postalCode) !== null;
}
