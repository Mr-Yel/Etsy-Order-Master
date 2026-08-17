const TEST_MODE = "test";

export const IS_TEST_BUILD = import.meta.env.MODE === TEST_MODE;
export const EOM_RUNTIME_CHANNEL = IS_TEST_BUILD ? TEST_MODE : "production";
export const EOM_DISPLAY_NAME = IS_TEST_BUILD
  ? "Etsy Order Master 测试版"
  : "Etsy Order Master";
export const EOM_UI_SUFFIX = IS_TEST_BUILD ? "（测试）" : "";

export function getRuntimeScopedId(productionId: string): string {
  return IS_TEST_BUILD ? `${productionId}-test` : productionId;
}

export function getRuntimeScopedMessageType(productionType: string): string {
  return IS_TEST_BUILD ? `${productionType}_TEST` : productionType;
}
