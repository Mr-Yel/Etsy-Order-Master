import { getRuntimeScopedMessageType } from "./runtime-identity";

export const ETSY_ORDER_SYNC_EVENT_MESSAGE_TYPE = getRuntimeScopedMessageType(
  "ETSY_ORDER_SYNC_EVENT"
);

export type EtsyCancelOrderConfirmedPayload = {
  requestId: string;
  shopId: string;
  etsyOrderId: string;
  cancellationReason?: string;
  etsyResult: {
    httpStatus: number;
    refundSuccess: true;
    cancelSuccess: true;
  };
  occurredAt: string;
  pageUrl: string;
};

export type EtsyCompleteOrderItem = {
  etsyOrderId: string;
  trackingNumber?: string;
  carrier?: string;
};

export type EtsyCompleteOrderConfirmedPayload = {
  requestId: string;
  shopId: string;
  orders: EtsyCompleteOrderItem[];
  occurredAt: string;
  pageUrl: string;
};

export type EtsyOrderSyncEvent =
  | {
      type: "etsy-order-cancel-confirmed";
      payload: EtsyCancelOrderConfirmedPayload;
    }
  | {
      type: "etsy-order-complete-confirmed";
      payload: EtsyCompleteOrderConfirmedPayload;
    };

export type EtsyOrderSyncMessage = {
  type: typeof ETSY_ORDER_SYNC_EVENT_MESSAGE_TYPE;
  event: EtsyOrderSyncEvent;
};

export type EtsyOrderSyncDispatchResult =
  | {
      accepted: true;
      mode: "observe" | "submit";
      jobId?: string;
      acceptedCount?: number;
    }
  | {
      accepted: false;
      mode: "observe" | "submit";
      error: string;
    };
