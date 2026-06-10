// Parse the current GitHub URL into chat room context
function parseGitHubContext() {
  const url = window.location.pathname;
  const match = url.match(/\/([^/]+)\/([^/]+)/);

  if (!match) return null;

  const owner = match[1];
  const repo = match[2];

  // Skip GitHub's own pages (homepage, settings, etc.)
  if (
    [
      "login",
      "settings",
      "marketplace",
      "explore",
      "orgs",
      "organizations",
    ].includes(owner)
  ) {
    return null;
  }

  if (url.includes("/pull/")) {
    const prMatch = url.match(/\/pull\/(\d+)/);
    if (prMatch) {
      return {
        type: "pr",
        owner,
        repo,
        number: prMatch[1],
        roomId: `${owner}/${repo}#pr-${prMatch[1]}`,
      };
    }
  }

  if (url.includes("/issues/")) {
    const issueMatch = url.match(/\/issues\/(\d+)/);
    if (issueMatch) {
      return {
        type: "issue",
        owner,
        repo,
        number: issueMatch[1],
        roomId: `${owner}/${repo}#issue-${issueMatch[1]}`,
      };
    }
  }

  return { type: "repo", owner, repo, roomId: `${owner}/${repo}` };
}

// Inject (or refresh) the chat sidebar iframe
function injectChatSidebar() {
  const context = parseGitHubContext();
  if (!context) return;

  // Already injected for this page — skip
  if (document.getElementById("github-chat-container")) return;

  const container = document.createElement("div");
  container.id = "github-chat-container";

  const params = new URLSearchParams({
    roomId: context.roomId,
    owner: context.owner,
    repo: context.repo,
    type: context.type,
  });

  container.innerHTML = `
    <iframe
      id="github-chat-iframe"
      src="${chrome.runtime.getURL("sidebar.html")}?${params}"
      style="
        position: fixed;
        right: 0;
        top: 60px;
        width: 380px;
        height: calc(100vh - 60px);
        border: none;
        z-index: 999999;
        background: #0d1117;
        box-shadow: -4px 0 20px rgba(0,0,0,0.3);
        border-radius: 12px 0 0 12px;
        transition: opacity 0.3s ease, visibility 0.3s ease;
      "
    ></iframe>
  `;

  document.body.appendChild(container);
}

// Listen for messages from the sidebar via chrome runtime (global listener)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const iframe = document.getElementById("github-chat-iframe");
  if (!iframe) return;
  
  if (request.action === "sidebar-minimized") {
    iframe.style.display = "none";
  } else if (request.action === "sidebar-maximized") {
    iframe.style.display = "block";
  }
});

// Remove sidebar (called on navigation away from a repo page)
function removeSidebar() {
  const el = document.getElementById("github-chat-container");
  if (el) el.remove();
}

// SPA navigation detection
let lastUrl = location.href;

new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    removeSidebar();
    setTimeout(injectChatSidebar, 500);
  }
}).observe(document, { subtree: true, childList: true });

// Initial injection
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectChatSidebar);
} else {
  injectChatSidebar();
}
