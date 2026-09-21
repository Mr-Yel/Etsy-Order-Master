export function buildArtworkImportFormFields(params) {
  const hasOwnerUserId =
    typeof params.ownerUserId === "number" &&
    Number.isFinite(params.ownerUserId);

  return {
    shopId: String(params.shopId),
    ...(hasOwnerUserId
      ? { ownerUserId: String(params.ownerUserId) }
      : {}),
  };
}
