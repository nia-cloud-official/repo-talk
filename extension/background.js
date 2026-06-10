(() => {
  // src/background.js
  var BACKEND_URL = "http://localhost:3000";
  var CLERK_PUBLISHABLE_KEY = "pk_test_aW52aXRpbmctZ2xvd3dvcm0tMjMuY2xlcmsuYWNjb3VudHMuZGV2JA";
  async function login() {
    if (!CLERK_PUBLISHABLE_KEY) {
      return { success: false, error: "CLERK_PUBLISHABLE_KEY not configured" };
    }
    try {
      const keyParts = CLERK_PUBLISHABLE_KEY.split(".");
      const domain = keyParts[1];
      const redirectUrl = chrome.identity.getRedirectURL();
      const authUrl = `https://accounts.${domain}/v1/client?after_sign_in_url=${encodeURIComponent(redirectUrl)}&after_sign_up_url=${encodeURIComponent(redirectUrl)}`;
      const responseUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true
      });
      if (!responseUrl) {
        throw new Error("Authentication cancelled");
      }
      const url = new URL(responseUrl);
      const token = url.searchParams.get("__clerk_jwt") || url.searchParams.get("token") || url.hash.slice(1);
      if (!token) {
        throw new Error("No token received from Clerk");
      }
      const res = await fetch(`${BACKEND_URL}/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${res.status}`);
      }
      const { token: appToken, user } = await res.json();
      await chrome.storage.local.set({ token: appToken, user });
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
