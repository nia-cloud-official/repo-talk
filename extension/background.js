(() => {
  // src/background.js
  var BACKEND_URL = "http://localhost:3000";
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status !== "complete") return;
    if (!tab.url?.startsWith(`${BACKEND_URL}/auth/done`)) return;
    setTimeout(async () => {
      const cookie = await chrome.cookies.get({
        url: BACKEND_URL,
        name: "repo_talk_token"
      });
      if (cookie?.value) {
        await chrome.storage.local.set({ token: cookie.value });
        chrome.cookies.remove({ url: BACKEND_URL, name: "repo_talk_token" });
        chrome.tabs.remove(tabId);
      }
    }, 2e3);
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
})();
//# sourceMappingURL=background.js.map
