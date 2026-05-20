export type EtsyOrderVariationQuestionType =
  | "text_input"
  | "unlabeled_upload"
  | string;

export type EtsyOrderVariation = {
  type: string;
  variation_id?: string;
  property_id?: string;
  value_id?: string;
  order?: number;
  property?: string;
  has_variation_price?: boolean;
  value?: string;
  question_type?: EtsyOrderVariationQuestionType;
};

export type EtsyOrderTransactionProduct = {
  type: string;
  product_id?: string;
  product_identifier?: string;
  title?: string;
  image_url_75x75?: string;
  is_digital?: boolean;
  is_sold_out?: boolean;
  has_refund_amount?: boolean;
  is_full_refund?: boolean;
};

export type EtsyOrderTransaction = {
  type: string;
  quantity?: number;
  transaction_id?: number | string;
  listing_id?: number;
  is_personalizable?: boolean;
  is_download?: boolean;
  is_retail?: boolean;
  product?: EtsyOrderTransactionProduct;
  variations?: EtsyOrderVariation[];
};

export type EtsyMoney = {
  type: string;
  value?: number;
  currency_code?: string;
  formatted_value?: string | null;
};

export type EtsyOrderCostBreakdown = {
  type: string;
  items_cost?: EtsyMoney;
  total_cost?: EtsyMoney;
  discount?: EtsyMoney;
  shipping_discount?: EtsyMoney;
  shipping_cost?: EtsyMoney;
  tax_cost?: EtsyMoney;
  adjusted_total_cost?: EtsyMoney;
};

export type EtsySellerMarketingCoupon = {
  type: string;
  code?: string;
  percentage?: number;
  coupon_id?: number;
  end_date?: number | null;
};

export type EtsyOrderPayment = {
  type: string;
  payment_date?: number;
  payment_method?: string;
  is_in_person_payment?: boolean;
  sellermarketing_coupons?: EtsySellerMarketingCoupon[];
  cost_breakdown?: EtsyOrderCostBreakdown;
};

export type EtsyOrderAddress = {
  type?: string;
  name?: string;
  first_line?: string;
  second_line?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  country_id?: number;
  phone?: string;
};

export type EtsyOrderFulfillment = {
  type: string;
  actual_ship_date?: number | null;
  expected_ship_date?: number;
  expected_or_actual_ship_date?: number;
  to_address?: EtsyOrderAddress;
};

export type EtsyBuyer = {
  type: string;
  buyer_id?: number;
  username?: string;
  name?: string;
  email?: string;
};

export type EtsyOrderState = {
  type: string;
  order_state_id: number;
  client_id: number | null;
  position: number;
  name: string;
  state_type: string;
  order_count: number | null;
  actions: string[];
};

export type EtsyOrder = {
  type: string;
  order_id: number;
  order_date?: number;
  buyer_id?: number;
  transaction_ids?: Array<number | string>;
  payment?: EtsyOrderPayment;
  fulfillment?: EtsyOrderFulfillment;
  transactions?: EtsyOrderTransaction[];
};

export type EtsyOrdersSearchCollection = {
  type: "Orders_OrdersCollection";
  total_count?: number;
  total_search_hit_count?: number;
  orders?: EtsyOrder[];
  buyers?: EtsyBuyer[];
  order_states?: EtsyOrderState[];
};

export type EtsyOrdersSearchResponse = {
  orders_search?: EtsyOrdersSearchCollection;
};

export type EtsyPhotoVariation = EtsyOrderVariation & {
  property?: "Photo" | string;
  question_type?: "unlabeled_upload" | string;
  value?: string;
};

export function isPhotoVariation(
  variation: EtsyOrderVariation | undefined | null
): variation is EtsyPhotoVariation {
  return !!variation && variation.question_type === "unlabeled_upload";
}

export function getUploadedPhotoCount(
  variation: EtsyOrderVariation | undefined | null
): number {
  if (!isPhotoVariation(variation)) return 0;
  const raw = (variation.value ?? "").trim().toLowerCase();
  const match = raw.match(/^(\d+)\s+file(s)?$/);
  return match ? Number(match[1]) : 0;
}
