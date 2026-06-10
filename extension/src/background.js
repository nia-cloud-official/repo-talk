// Minimal background service worker.
// Clerk manages session state automatically via chrome.storage — no manual
// token interception needed here anymore.

chrome.runtime.onInstalled.addListener(() => {
  console.log('Repo Talk - GitHub Chat extension installed');
});
