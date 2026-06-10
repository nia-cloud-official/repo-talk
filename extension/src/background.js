// Background service worker — watches for the auth tab to land on /auth/done,
// reads the short-lived cookie the server page sets, then stores our own JWT.

const BACKEND_URL = process.env.BACKEND_URL;

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url?.startsWith(`${BACKEND_URL}/auth/done`)) return;

  // Give the page's JS ~2 s to run and set the cookie before we read it
  setTimeout(async () => {
    const cookie = await chrome.cookies.get({
      url: BACKEND_URL,
      name: "repo_talk_token",
    });

    if (cookie?.value) {
      await chrome.storage.local.set({ token: cookie.value });
      // Clean up the cookie so it isn't left lying around
      chrome.cookies.remove({ url: BACKEND_URL, name: "repo_talk_token" });
      chrome.tabs.remove(tabId);
    }
  }, 2000);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getToken") {
    chrome.storage.local.get(["token"], (result) => {
      sendResponse({ token: result.token || null });
    });
    return true;
  }

  if (request.action === "logout") {
    chrome.storage.local.remove(["token"], () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("Repo Talk - GitHub Chat extension installed");
});
