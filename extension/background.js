const BACKEND_URL = 'http://localhost:3000';

// Listen for tab URL updates to catch the OAuth token
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    try {
      const url = new URL(changeInfo.url);
      
      // Look for the token query parameter coming back from your back-end login flow
      const token = url.searchParams.get('token');

      if (token) {
        // Save the token securely to local storage
        chrome.storage.local.set({ token }, () => {
          console.log('Token successfully secured inside storage.');

          // Notify the popup UI if it is currently open
          chrome.runtime.sendMessage({
            action: 'tokenReceived',
            token: token,
          }).catch(() => {
            // Suppress errors if the popup is closed
          });

          // Safely close the temporary authentication tab
          chrome.tabs.remove(tabId);
        });
      }
    } catch (e) {
      // Ignore unparseable or internal browser URLs safely
    }
  }
});

// Handle extension installation initialization
chrome.runtime.onInstalled.addListener(() => {
  console.log('Repo Talk - GitHub Chat extension active and ready');
});

// Asynchronous message handler for popup and content script requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getToken') {
    chrome.storage.local.get(['token'], (result) => {
      sendResponse({ token: result.token || null });
    });
    return true; // Keeps the message channel open asynchronously
  }

  if (request.action === 'getUser') {
    chrome.storage.local.get(['user'], (result) => {
      sendResponse({ user: result.user || null });
    });
    return true; // Keeps the message channel open asynchronously
  }

  if (request.action === 'logout') {
    chrome.storage.local.remove(['token', 'user'], () => {
      sendResponse({ success: true });
    });
    return true; // Keeps the message channel open asynchronously
  }
});
