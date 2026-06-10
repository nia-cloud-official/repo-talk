(() => {
  // src/background.js
  var BACKEND_URL = "https://repo-talk.onrender.com";
  var GITHUB_CLIENT_ID = "";
  async function login() {
    if (!GITHUB_CLIENT_ID) {
      return { success: false, error: "GITHUB_CLIENT_ID not configured" };
    }
    try {
      const redirectUrl = chrome.identity.getRedirectURL();
      const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUrl)}&scope=user:email`;
      const responseUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true
      });
      if (!responseUrl) {
        throw new Error("Authentication cancelled");
      }
      const url = new URL(responseUrl);
      const code = url.searchParams.get("code");
      if (!code) {
        throw new Error("No code received from GitHub");
      }
      const res = await fetch(`${BACKEND_URL}/auth/github/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, redirect_uri: redirectUrl })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${res.status}`);
      }
      const { token, user } = await res.json();
      await chrome.storage.local.set({ token, user });
      return { success: true };
    } catch (err) {
      console.error("Login failed:", err.message);
      return { success: false, error: err.message };
    }
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
