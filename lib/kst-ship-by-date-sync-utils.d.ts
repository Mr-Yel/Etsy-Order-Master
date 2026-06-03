export function formatChinaDateTimeFromUnixSeconds(seconds: number): string;

export function appendShipByDateLog(options: {
  errorInfo?: string | null;
  platformOrderId: string;
  latestDeliveryTime: string;
  now?: number;
  randomIdPart?: string;
}): string;
