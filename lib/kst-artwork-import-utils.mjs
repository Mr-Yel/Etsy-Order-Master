export const ARTWORK_PACKAGE_ROOT_PATH = "待导入图包";

export function buildArtworkImportFormFields(
  params,
  createRequestId = () => crypto.randomUUID()
) {
  const hasOwnerUserId =
    typeof params.ownerUserId === "number" &&
    Number.isFinite(params.ownerUserId);

  return {
    shopId: String(params.shopId),
    ...(hasOwnerUserId
      ? { ownerUserId: String(params.ownerUserId) }
      : {}),
    forceReimport: "true",
    artworkRequestId: createRequestId(),
    packageRootPath: ARTWORK_PACKAGE_ROOT_PATH,
  };
}
