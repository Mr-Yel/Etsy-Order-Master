export const USPS_REMOTE_POSTAL_PREFIXES: readonly string[];

export function getUspsRemotePostalPrefix(
  postalCode: unknown
): string | null;

export function isUspsRemotePostalCode(postalCode: unknown): boolean;
