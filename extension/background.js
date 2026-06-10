const BACKEND_URL = 'http://localhost:3000';

// Listen for OAuth callback
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const url = new URL(details.url);
    const token = url.searchParams.get('token');

    if (token) {
      // Save token to storage
      chrome.storage.local.set({ token }, () => {
        // Notify popup
        chrome.runtime.sendMessage({
          action: 'tokenReceived',
          token: token,
        }).catch(() => {
          // Popup might not be open, that's ok
        });

        // Close the auth tab
        chrome.tabs.remove(details.tabId);
      });

      // Redirect to close page
      return { redirectUrl: 'about:blank' };
    }
  },
  { urls: ['chrome-extension://*/'] },
  ['blocking']
);

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('GitHub Chat extension installed');
});

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getToken') {
    chrome.storage.local.get(['token'], (result) => {
      sendResponse({ token: result.token });
    });
    return true;
  }

  if (request.action === 'getUser') {
    chrome.storage.local.get(['user'], (result) => {
      sendResponse({ user: result.user });
    });
    return true;
  }

  if (request.action === 'logout') {
    chrome.storage.local.remove(['token', 'user'], () => {
      sendResponse({ success: true });
    });
    return true;
  }
});
