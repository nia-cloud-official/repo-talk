const BACKEND_URL = process.env.BACKEND_URL;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;

async function login() {
  if (!GITHUB_CLIENT_ID) {
    return { success: false, error: "GITHUB_CLIENT_ID not configured" };
  }

  try {
    // GitHub OAuth flow for Chrome extensions
    const redirectUrl = chrome.identity.getRedirectURL();
    console.log("Redirect URL:", redirectUrl);
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUrl)}&scope=user:email`;
    console.log("Auth URL:", authUrl);

    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true,
    });

    console.log("Response URL:", responseUrl);

    if (!responseUrl) {
      throw new Error("Authentication cancelled");
    }

    // Extract the code from the URL
    const url = new URL(responseUrl);
    const code = url.searchParams.get("code");
    console.log("Code:", code ? "received" : "not found");

    if (!code) {
      throw new Error("No code received from GitHub");
    }

    // Send code to backend for token exchange
    console.log("Sending to backend:", `${BACKEND_URL}/auth/github/callback`);
    const res = await fetch(`${BACKEND_URL}/auth/github/callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, redirect_uri: redirectUrl }),
    });

    console.log("Backend response status:", res.status);
    const responseData = await res.json();
    console.log("Backend response:", responseData);

    if (!res.ok) {
      throw new Error(responseData.error || `Server error ${res.status}`);
    }

    const { token, user } = responseData;
    await chrome.storage.local.set({ token, user });
    console.log("Login successful, token stored");
    return { success: true };
  } catch (err) {
    console.error("Login failed:", err.message);
    console.error("Full error:", err);
    return { success: false, error: err.message };
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "login") {
    login().then(sendResponse);
    return true; // keep channel open for async response
  }

  if (request.action === "getToken") {
    chrome.storage.local.get(["token"], (r) =>
      sendResponse({ token: r.token || null }),
    );
    return true;
  }

  if (request.action === "logout") {
    chrome.storage.local.remove(["token", "user"], () =>
      sendResponse({ success: true }),
    );
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("Repo Talk installed");
});
