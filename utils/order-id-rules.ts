export type OrderIdRuleContext = {
  shopId?: number | string | null;
  orderId: number | string;
};

type OrderIdRule = {
  match: (ctx: OrderIdRuleContext) => boolean;
  transform: (ctx: OrderIdRuleContext) => string;
};

const rules: OrderIdRule[] = [
  {
    match: ({ shopId }) => String(shopId ?? "") === "26833914",
    transform: ({ orderId }) => `SLC${String(orderId ?? "")}`,
  },
];

export const getExportOrderId = (ctx: OrderIdRuleContext): string => {
  const normalizedOrderId = String(ctx.orderId ?? "").trim();
  if (!normalizedOrderId) return "";

  const normalizedCtx: OrderIdRuleContext = {
    ...ctx,
    orderId: normalizedOrderId,
  };

  const matchedRule = rules.find((rule) => rule.match(normalizedCtx));
  if (!matchedRule) return normalizedOrderId;

  return matchedRule.transform(normalizedCtx);
};

