// Parse GitHub URL to extract context
function parseGitHubContext() {
  const url = window.location.pathname;
  const match = url.match(/\/([^/]+)\/([^/]+)/);

  if (!match) return null;

  const owner = match[1];
  const repo = match[2];

  // Check if it's a PR
  if (url.includes('/pull/')) {
    const prMatch = url.match(/\/pull\/(\d+)/);
    if (prMatch) {
      return {
        type: 'pr',
        owner,
        repo,
        number: prMatch[1],
        roomId: `${owner}/${repo}#pr-${prMatch[1]}`,
      };
    }
  }

  // Check if it's an issue
  if (url.includes('/issues/')) {
    const issueMatch = url.match(/\/issues\/(\d+)/);
    if (issueMatch) {
      return {
        type: 'issue',
        owner,
        repo,
        number: issueMatch[1],
        roomId: `${owner}/${repo}#issue-${issueMatch[1]}`,
      };
    }
  }

  // It's a repo
  return {
    type: 'repo',
    owner,
    repo,
    roomId: `${owner}/${repo}`,
  };
}

// Get token from storage
function getToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['token'], (result) => {
      resolve(result.token);
    });
  });
}

// Get user from storage
function getUser() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['user'], (result) => {
      resolve(result.user);
    });
  });
}

// Create and inject chat iframe
async function injectChatSidebar() {
  const context = parseGitHubContext();
  
  if (!context) return;

  const token = await getToken();
  const user = await getUser();

  if (!token || !user) {
    console.log('Not authenticated, skipping chat injection');
    return;
  }

  // Check if already injected
  if (document.getElementById('github-chat-container')) {
    return;
  }

  // Create container
  const container = document.createElement('div');
  container.id = 'github-chat-container';
  container.innerHTML = `
    <iframe 
      id="github-chat-iframe"
      src="${chrome.runtime.getURL('sidebar.html')}?roomId=${encodeURIComponent(context.roomId)}&owner=${encodeURIComponent(context.owner)}&repo=${encodeURIComponent(context.repo)}&type=${context.type}"
      style="
        position: fixed;
        right: 0;
        top: 0;
        width: 380px;
        height: 100vh;
        border: none;
        z-index: 999999;
        background: white;
        box-shadow: -2px 0 10px rgba(0,0,0,0.1);
      "
    ></iframe>
  `;

  document.body.appendChild(container);
}

// Watch for URL changes (SPA navigation)
let lastUrl = location.href;

new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(injectChatSidebar, 500);
  }
}).observe(document, { subtree: true, childList: true });

// Initial injection
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectChatSidebar);
} else {
  injectChatSidebar();
}
