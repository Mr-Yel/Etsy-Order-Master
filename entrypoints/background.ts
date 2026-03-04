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

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === "OPEN_LOGIN_PAGE") {
      void openOrFocusLoginPage();
    }
  });
});

