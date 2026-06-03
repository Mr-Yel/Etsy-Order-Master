import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const SOURCE = "etsy-update-ship-by-date";
const STAGE = "update-latest-delivery-time";

export function formatChinaDateTimeFromUnixSeconds(seconds) {
  return dayjs.unix(Number(seconds)).tz("Asia/Shanghai").format("YYYY-MM-DD HH:mm:ss");
}

export function appendShipByDateLog({
  errorInfo,
  platformOrderId,
  latestDeliveryTime,
  now = Date.now(),
  randomIdPart = Math.random().toString(36).slice(2, 10),
}) {
  let parsed = { data: [] };
  if (typeof errorInfo === "string" && errorInfo.trim()) {
    try {
      var existing = JSON.parse(errorInfo);
      if (existing && typeof existing === "object" && Array.isArray(existing.data)) {
        parsed = existing;
      }
    } catch {
      parsed = { data: [] };
    }
  }

  parsed.data.push({
    type: "success",
    info: `[Etsy修改最晚发货时间] 已同步 Etsy 最新发货时间：${latestDeliveryTime}`,
    source: SOURCE,
    stage: STAGE,
    scopeId: SOURCE,
    dedupeKey: `${SOURCE}|${STAGE}|success|${platformOrderId}|${latestDeliveryTime}`,
    id: `${now}-${randomIdPart}`,
    timestamp: now,
  });

  return JSON.stringify(parsed);
}
