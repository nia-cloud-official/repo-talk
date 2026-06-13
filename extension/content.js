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
      "
    ></iframe>
  `;

  document.body.appendChild(container);

  // Also inject floating button
  injectFloatingButton();
}

function injectFloatingButton() {
  if (document.getElementById("repo-talk-floating-button")) return;

  const floatingBtn = document.createElement("div");
  floatingBtn.id = "repo-talk-floating-button";
  floatingBtn.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: #238636;
    box-shadow: 0 4px 12px rgba(35, 134, 54, 0.4);
    cursor: pointer;
    display: none;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
    z-index: 1000000;
    border: 3px solid #0d1117;
  `;
  
  floatingBtn.innerHTML = `<img src="${chrome.runtime.getURL("icon48.png")}" alt="Repo Talk" style="width: 32px; height: 32px; border-radius: 50%;" />`;
  
  floatingBtn.addEventListener("click", () => {
    const iframe = document.getElementById("github-chat-iframe");
    if (iframe) {
      iframe.style.display = "block";
      floatingBtn.style.display = "none";
    }
  });

  document.body.appendChild(floatingBtn);
}

// Listen for messages from the sidebar via window postMessage
window.addEventListener("message", (event) => {
  console.log("Content script received message:", event.data.type);
  const iframe = document.getElementById("github-chat-iframe");
  const floatingBtn = document.getElementById("repo-talk-floating-button");
  console.log("Iframe found:", !!iframe);
  console.log("Floating button found:", !!floatingBtn);
  
  if (!iframe) return;
  
  if (event.data.type === "sidebar-minimized") {
    console.log("Hiding iframe, showing floating button");
    iframe.style.display = "none";
    if (floatingBtn) floatingBtn.style.display = "flex";
  } else if (event.data.type === "sidebar-maximized") {
    console.log("Showing iframe, hiding floating button");
    iframe.style.display = "block";
    if (floatingBtn) floatingBtn.style.display = "none";
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
