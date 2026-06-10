const BACKEND_URL = process.env.BACKEND_URL;

async function login() {
  // Login is now handled in the popup using Clerk SDK
  // This function just returns success for compatibility
  return { success: true };
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
