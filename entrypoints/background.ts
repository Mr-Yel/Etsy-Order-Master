import {
  APP_LOG_MESSAGE_TYPE,
  type AppLogMessage,
} from "@/lib/app-log";
import {
  enqueueAppLogFromEvent,
  logBackgroundRuntimeStarted,
} from "@/lib/app-log-background";
import { pruneSyncedOrderCache } from "@/lib/kst-sync-cache";
import {
  KST_PROXY_MESSAGE_TYPE,
  type KstProxyRequest,
} from "@/lib/kst-proxy-types";
import { runKstProxyInBackground } from "@/lib/kst-proxy";
import { openLoginPage, handle401 } from "@/lib/auth-manager";

export default defineBackground(() => {
  console.log("Hello background!", { id: browser.runtime.id });
  logBackgroundRuntimeStarted();
  void pruneSyncedOrderCache().catch((error) => {
    console.warn("[KST] Failed to prune synced order cache on background start", error);
  });

  browser.runtime.onMessage.addListener(
    (
      message: unknown,
      sender: {
        url?: string;
        origin?: string;
        frameId?: number;
        tab?: { id?: number };
      },
      sendResponse: (response: unknown) => void
    ) => {
      if ((message as { type?: string })?.type === "OPEN_LOGIN_PAGE") {
        void openLoginPage();
        return false;
      }

      if ((message as { type?: string })?.type === APP_LOG_MESSAGE_TYPE) {
        const appLogMessage = message as AppLogMessage;
        console.log("[APP-LOG] Background received log message", {
          event: appLogMessage.payload.event,
          orderNo: appLogMessage.payload.orderNo ?? "__SYSTEM__",
          source: appLogMessage.payload.source ?? "",
          senderUrl: sender.url ?? "",
          senderOrigin: sender.origin ?? "",
          senderTabId: sender.tab?.id ?? null,
          senderFrameId: sender.frameId ?? null,
        });
        void enqueueAppLogFromEvent(appLogMessage.payload, sender);
        sendResponse({ success: true as const });
        return false;
      }

      if ((message as { type?: string })?.type === KST_PROXY_MESSAGE_TYPE) {
        const req = message as KstProxyRequest & { type: string };
        runKstProxyInBackground({
          path: req.path,
          method: req.method,
          query: req.query,
          body: req.body,
          formFile: req.formFile,
          formFields: req.formFields,
          token: req.token,
        })
          .then(async (data) => {
            const body = data as { code?: number; msg?: string };
            if (body?.code === 401) {
              console.log("[KST] 检测到 401，执行 handle401");
              const result = await handle401();
              console.log("[KST] handle401 结果", {
                autoLoggedIn: result.autoLoggedIn,
                errorMessage: result.errorMessage,
              });
              sendResponse({
                success: false as const,
                error: result.errorMessage ?? body?.msg ?? "登录已过期",
                code: 401,
                autoLoggedIn: result.autoLoggedIn,
              });
              return;
            }
            sendResponse({ success: true as const, data });
          })
          .catch((err: Error) =>
            sendResponse({
              success: false as const,
              error: err?.message ?? String(err),
            })
          );
        return true;
      }

      return false;
    }
  );
});

