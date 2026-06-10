(() => {
  // src/background.js
  async function login() {
    return { success: true };
  }
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "login") {
      login().then(sendResponse);
      return true;
    }
    if (request.action === "getToken") {
      chrome.storage.local.get(
        ["token"],
        (r) => sendResponse({ token: r.token || null })
      );
      return true;
    }
    if (request.action === "logout") {
      chrome.storage.local.remove(
        ["token", "user"],
        () => sendResponse({ success: true })
      );
      return true;
    }
  });
  chrome.runtime.onInstalled.addListener(() => {
    console.log("Repo Talk installed");
  });
})();
//# sourceMappingURL=background.js.map
