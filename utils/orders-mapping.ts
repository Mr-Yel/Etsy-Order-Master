import { getExportOrderId } from "./order-id-rules";

/**
 * 将订单列表接口返回的 orders + buyers 映射为导出表行
 * 字段与顺序以 etsy-order-api-fields-mapping.md 第一节为准
 */
export const EXPORT_COLUMNS = [
  "Sale Date",
  "Date Paid",
  "Order ID",
  "Transaction ID",
  "Buyer User ID",
  "Full Name",
  "First Name",
  "Last Name",
  "Number of Items",
  "Payment Method",
  "Ship Date",
  "Latest Ship Date",
  "Street 1",
  "Street 2",
  "Ship City",
  "Ship State",
  "Ship Zipcode",
  "Ship Country",
  "Currency",
  "Order Value",
  "Coupon Code",
  "Coupon Details",
  "Discount Amount",
  "Shipping Discount",
  "Shipping",
  "Sales Tax",
  "Order Total",
  "Status",
  "Card Processing Fees",
  "Order Net",
  "Adjusted Order Total",
  "Adjusted Card Processing Fees",
  "Adjusted Net Order Amount",
  "Buyer",
  "Order Type",
  "Payment Type",
  "InPerson Discount",
  "InPerson Location",
  "SKU",
  "Item Name",
] as const;

export type ExportTableRow = Record<(typeof EXPORT_COLUMNS)[number], string>;

type RawTransaction = {
  quantity?: number;
  transaction_id?: number;
  product?: { product_identifier?: string; title?: string };
};

type RawOrder = {
  order_id: number;
  transaction_ids?: number[];
  order_date?: number;
  buyer_id?: number;
  fulfillment?: {
    actual_ship_date?: number | null;
    expected_ship_date?: number;
    to_address?: {
      name?: string;
      first_line?: string;
      second_line?: string;
      city?: string;
      state?: string;
      zip?: string;
      country?: string;
    };
  };
  payment?: {
    payment_date?: number;
    payment_method?: string;
    is_in_person_payment?: boolean;
    cost_breakdown?: {
      items_cost?: { value?: number; currency_code?: string };
      total_cost?: { value?: number; currency_code?: string };
      discount?: { value?: number };
      shipping_discount?: { value?: number };
      shipping_cost?: { value?: number };
      tax_cost?: { value?: number };
      adjusted_total_cost?: { value?: number };
    };
    sellermarketing_coupons?: Array<{ code?: string; percentage?: number }>;
  };
  transactions?: RawTransaction[];
  [key: string]: unknown;
};

type RawBuyer = {
  buyer_id?: number;
  username?: string;
  name?: string;
  [key: string]: unknown;
};

/** 销售日期：Unix 时间戳（秒）按 UTC → MM/DD/YY，避免本地时区导致日期偏移 */
function formatSaleDate(ts: number | undefined): string {
  if (ts == null) return "";
  const d = new Date(ts * 1000);
  const y = d.getUTCFullYear().toString().slice(-2);
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  return `${m}/${day}/${y}`;
}

/** Unix 时间戳（秒）按 UTC → MM/DD/YYYY */
function formatDateUTC(ts: number | undefined | null): string {
  if (ts == null) return "";
  const d = new Date(ts * 1000);
  const y = d.getUTCFullYear().toString();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  return `${m}/${day}/${y}`;
}

function safeStr(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

/** 从收货人全名拆出 First / Last（首段为 First，其余为 Last） */
function splitName(fullName: string): { first: string; last: string } {
  const t = fullName.trim().split(/\s+/);
  if (t.length === 0) return { first: "", last: "" };
  if (t.length === 1) return { first: t[0], last: "" };
  return { first: t[0], last: t.slice(1).join(" ") };
}

/** payment_method → Payment Type，如 online_cc */
function toPaymentType(method: string | undefined, isInPerson: boolean): string {
  if (isInPerson) return "in_person";
  const m = (method ?? "").toLowerCase();
  if (m === "cc" || m === "apple_pay") return "online_cc";
  if (m === "dc_paypal" || m === "paypal") return "online_paypal";
  return m ? `online_${m}` : "online_cc";
}

/** 优惠券详情：如 15 → "15% off"，无则 "% off" */
function formatCouponDetails(percentage: number | undefined): string {
  if (percentage != null && percentage > 0) return `${percentage}% off`;
  return "% off";
}

/** 金额（分→元，保留两位） */
function formatCents(value: number | undefined): string {
  if (value == null) return "";
  if (value === 0) return "0";
  return (value / 100).toFixed(2);
}

/** Card Processing Fees：processing_fee 为负数，取绝对值后 amount/divisor */
function formatProcessingFee(fee: ProcessingFeeFromDetail | undefined): string {
  if (fee?.divisor == null || fee.divisor === 0) return "";
  const amount = fee.amount ?? 0;
  return (Math.abs(amount) / fee.divisor).toFixed(2);
}

/** 收益明细接口返回中 fees_and_credits_details.processing_fee 结构（用于 Card Processing Fees） */
export type ProcessingFeeFromDetail = {
  amount?: number;
  divisor?: number;
  currency_code?: string;
  currency_formatted_short?: string;
};

export type MapOrdersOptions = {
  /** Etsy 店铺 ID，用于根据规则生成导出用订单 ID */
  shopId?: number;
  /** 按 order_id 的收益明细（含 processing_fee），用于填充 Card Processing Fees */
  earningsByOrderId?: Record<number, { fees_and_credits_details?: { processing_fee?: ProcessingFeeFromDetail } }>;
};

export function mapOrdersToTableRows(
  orders: RawOrder[],
  buyers: RawBuyer[],
  options: MapOrdersOptions = {}
): ExportTableRow[] {
  const { shopId, earningsByOrderId } = options;
  const buyerMap = new Map<number, RawBuyer>();
  buyers.forEach((b) => {
    if (b.buyer_id != null) buyerMap.set(b.buyer_id, b);
  });

  return orders.flatMap((order) => {
    const buyer =
      order.buyer_id != null ? buyerMap.get(order.buyer_id) : undefined;
    const addr = order.fulfillment?.to_address;
    const fullName = addr?.name ?? "";
    const { first: firstName, last: lastName } = splitName(fullName);
    const cost = order.payment?.cost_breakdown;
    const coupons = order.payment?.sellermarketing_coupons ?? [];
    const firstCoupon = coupons[0];
    const couponCode = firstCoupon?.code ?? "";
    const couponDetails = formatCouponDetails(firstCoupon?.percentage);
    const earnings = order.order_id != null ? earningsByOrderId?.[order.order_id] : undefined;
    const cardProcessingFees = formatProcessingFee(earnings?.fees_and_credits_details?.processing_fee);
    const fallbackTransactionIds = order.transaction_ids ?? [];
    const transactions: RawTransaction[] =
      order.transactions != null && order.transactions.length > 0
        ? order.transactions
        : [{}];

    return transactions.map((transaction, index) => {
      const fallbackTransactionId = fallbackTransactionIds[index];

      return {
        "Sale Date": formatSaleDate(order.order_date),
        "Date Paid": formatDateUTC(order.payment?.payment_date),
        "Order ID": getExportOrderId({
          shopId,
          orderId: order.order_id,
        }),
        "Transaction ID": safeStr(transaction.transaction_id ?? fallbackTransactionId),
        "Buyer User ID": safeStr(buyer?.username),
        "Full Name": fullName,
        "First Name": firstName,
        "Last Name": lastName,
        "Number of Items": safeStr(transaction.quantity ?? ""),
        "Payment Method": "Credit Card",
        "Ship Date": formatDateUTC(order.fulfillment?.actual_ship_date),
        "Latest Ship Date": formatDateUTC(order.fulfillment?.expected_ship_date),
        "Street 1": safeStr(addr?.first_line),
        "Street 2": safeStr(addr?.second_line),
        "Ship City": safeStr(addr?.city),
        "Ship State": safeStr(addr?.state),
        "Ship Zipcode": safeStr(addr?.zip),
        "Ship Country": safeStr(addr?.country),
        Currency: cost?.total_cost?.currency_code ?? cost?.items_cost?.currency_code ?? "",
        "Order Value": formatCents(cost?.items_cost?.value),
        "Coupon Code": couponCode,
        "Coupon Details": couponDetails,
        "Discount Amount": formatCents(cost?.discount?.value),
        "Shipping Discount": formatCents(cost?.shipping_discount?.value),
        Shipping: formatCents(cost?.shipping_cost?.value),
        // "Sales Tax": formatCents(cost?.tax_cost?.value),
        "Sales Tax": "0",
        "Order Total": formatCents(cost?.total_cost?.value),
        Status: "",
        "Card Processing Fees": cardProcessingFees,
        "Order Net": "暂时无法获取",
        "Adjusted Order Total": "0",
        "Adjusted Card Processing Fees": "0",
        "Adjusted Net Order Amount": "0",
        Buyer: fullName,
        "Order Type": "online",
        // Payment Type 版本一：使用 toPaymentType(payment_method, is_in_person)
        // "Payment Type": toPaymentType(order.payment?.payment_method, order.payment?.is_in_person_payment ?? false),
        // Payment Type 版本二（当前导出）：统一写为 online_cc
        "Payment Type": "online_cc",
        "InPerson Discount": "",
        "InPerson Location": "",
        SKU: safeStr(transaction.product?.product_identifier),
        "Item Name": safeStr(transaction.product?.title),
      };
    });
  });
}
