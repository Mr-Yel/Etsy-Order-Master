import {
  KST_PROXY_MESSAGE_TYPE,
  type KstProxyRequest,
} from "@/lib/kst-proxy-types";
import { runKstProxyInBackground } from "@/lib/kst-proxy";
import { openLoginPage } from "@/lib/auth-manager";

export default defineBackground(() => {
  console.log("Hello background!", { id: browser.runtime.id });

  browser.runtime.onMessage.addListener(
    (
      message: unknown,
      _sender: unknown,
      sendResponse: (response: unknown) => void
    ) => {
      if ((message as { type?: string })?.type === "OPEN_LOGIN_PAGE") {
        void openLoginPage();
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
          .then((data) => sendResponse({ success: true as const, data }))
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

