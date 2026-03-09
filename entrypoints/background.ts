import {
  KST_PROXY_MESSAGE_TYPE,
  type KstProxyRequest,
} from "@/lib/kst-proxy-types";
import { runKstProxyInBackground } from "@/lib/kst-proxy";

const LOGIN_URL = browser.runtime.getURL("/login.html");

async function openOrFocusLoginPage() {
  try {
    const tabs = await browser.tabs.query({ url: LOGIN_URL });

    if (tabs.length > 0) {
      const targetTab = tabs[0];

      if (targetTab.id != null) {
        await browser.tabs.update(targetTab.id, { active: true });
      }

      if (targetTab.windowId != null) {
        await browser.windows.update(targetTab.windowId, { focused: true });
      }
    } else {
      await browser.tabs.create({ url: LOGIN_URL });
    }
  } catch (error) {
    console.error("openOrFocusLoginPage error:", error);
  }
}

export default defineBackground(() => {
  console.log("Hello background!", { id: browser.runtime.id });

  browser.runtime.onMessage.addListener(
    (
      message: unknown,
      _sender: unknown,
      sendResponse: (response: unknown) => void
    ) => {
      if ((message as { type?: string })?.type === "OPEN_LOGIN_PAGE") {
        void openOrFocusLoginPage();
        return false;
      }

      if ((message as { type?: string })?.type === KST_PROXY_MESSAGE_TYPE) {
        const req = message as KstProxyRequest & { type: string };
        runKstProxyInBackground({
          path: req.path,
          method: req.method,
          query: req.query,
          body: req.body,
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

