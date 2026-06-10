const BACKEND_URL = process.env.BACKEND_URL;
const CLERK_PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY;

async function login() {
  if (!CLERK_PUBLISHABLE_KEY) {
    return { success: false, error: "CLERK_PUBLISHABLE_KEY not configured" };
  }

  try {
    // Decode the base64 encoded instance ID from the publishable key
    // Format: pk_test_[base64_instance_id].[frontend_api_url]
    const keyParts = CLERK_PUBLISHABLE_KEY.replace('pk_', '').split('.');
    const encodedInstanceId = keyParts[0];
    const instanceId = atob(encodedInstanceId);
    
    // Use Clerk's hosted authentication page
    const redirectUrl = chrome.identity.getRedirectURL();
    const authUrl = `https://${instanceId}/v1/client?after_sign_in_url=${encodeURIComponent(redirectUrl)}&after_sign_up_url=${encodeURIComponent(redirectUrl)}`;

    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true,
    });

    if (!responseUrl) {
      throw new Error("Authentication cancelled");
    }

    // Extract the token from the URL
    const url = new URL(responseUrl);
    const token = url.searchParams.get("__clerk_jwt") || url.searchParams.get("token") || url.hash.slice(1);

    if (!token) {
      throw new Error("No token received from Clerk");
    }

    // Verify the token with our backend and get our app token
    const res = await fetch(`${BACKEND_URL}/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
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
