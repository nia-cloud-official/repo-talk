const BACKEND_URL = 'http://localhost:3000';

const elements = {
  authSection: document.getElementById('auth-section'),
  userSection: document.getElementById('user-section'),
  loadingSection: document.getElementById('loading-section'),
  errorSection: document.getElementById('error-section'),
  loginBtn: document.getElementById('login-btn'),
  logoutBtn: document.getElementById('logout-btn'),
  userName: document.getElementById('user-name'),
  userHandle: document.getElementById('user-handle'),
  userAvatar: document.getElementById('user-avatar'),
  statusText: document.getElementById('status-text'),
  errorText: document.getElementById('error-text'),
  errorRetryBtn: document.getElementById('error-retry-btn'),
};

// Show/hide sections
function showSection(section) {
  [elements.authSection, elements.userSection, elements.loadingSection, elements.errorSection].forEach(el => {
    if (el) el.style.display = 'none';
  });
  if (section) section.style.display = 'block';
}

// Get stored token
async function getToken() {
  return new Promise(resolve => {
    chrome.storage.local.get(['token'], result => {
      resolve(result.token);
    });
  });
}

// Save token
async function saveToken(token) {
  return new Promise(resolve => {
    chrome.storage.local.set({ token }, resolve);
  });
}

// Clear token
async function clearToken() {
  return new Promise(resolve => {
    chrome.storage.local.remove(['token'], resolve);
  });
}

// Get stored user
async function getStoredUser() {
  return new Promise(resolve => {
    chrome.storage.local.get(['user'], result => {
      resolve(result.user);
    });
  });
}

// Save user
async function saveUser(user) {
  return new Promise(resolve => {
    chrome.storage.local.set({ user }, resolve);
  });
}

// Fetch user from backend
async function fetchUser(token) {
  try {
    const response = await fetch(`${BACKEND_URL}/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user');
    }

    return await response.json();
  } catch (error) {
    console.error('Fetch user error:', error);
    throw error;
  }
}

// Verify token validity
async function verifyToken(token) {
  try {
    const response = await fetch(`${BACKEND_URL}/auth/verify`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    return response.ok;
  } catch (error) {
    return false;
  }
}

// Display user info
function displayUser(user) {
  elements.userName.textContent = user.username;
  elements.userHandle.textContent = `@${user.username}`;
  elements.userAvatar.src = user.avatar_url;
  
  const onPage = getCurrentPageInfo();
  if (onPage) {
    elements.statusText.textContent = `Active on ${onPage.type}: ${onPage.name}`;
  } else {
    elements.statusText.textContent = 'Ready to chat on any repository';
  }
}

// Get current page info
function getCurrentPageInfo() {
  const url = window.location.href;

  if (url.includes('github.com')) {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (match) {
      if (url.includes('/pull/')) {
        return { type: 'Pull Request', name: `${match[1]}/${match[2]}` };
      } else if (url.includes('/issues/')) {
        return { type: 'Issue', name: `${match[1]}/${match[2]}` };
      } else {
        return { type: 'Repository', name: `${match[1]}/${match[2]}` };
      }
    }
  }

  return null;
}

// Login handler
elements.loginBtn.addEventListener('click', async () => {
  showSection(elements.loadingSection);

  try {
    // Open GitHub OAuth login in new tab
    chrome.tabs.create({
      url: `${BACKEND_URL}/auth/github/login`,
    }, (tab) => {
      // Listen for token from redirect
      const checkForToken = async () => {
        const token = await getToken();
        if (token) {
          chrome.tabs.remove(tab.id);
          await initializeApp();
        } else {
          setTimeout(checkForToken, 1000);
        }
      };

      setTimeout(checkForToken, 1000);
    });
  } catch (error) {
    elements.errorText.textContent = 'Failed to initiate login. Please try again.';
    showSection(elements.errorSection);
  }
});

// Logout handler
elements.logoutBtn.addEventListener('click', async () => {
  await clearToken();
  await chrome.storage.local.remove(['user']);
  await initializeApp();
});

// Error retry
elements.errorRetryBtn.addEventListener('click', async () => {
  await initializeApp();
});

// Initialize app
async function initializeApp() {
  showSection(elements.loadingSection);

  try {
    let token = await getToken();
    let user = await getStoredUser();

    // If no token, show login
    if (!token) {
      showSection(elements.authSection);
      return;
    }

    // Verify token is still valid
    const isValid = await verifyToken(token);

    if (!isValid) {
      await clearToken();
      showSection(elements.authSection);
      return;
    }

    // Fetch fresh user data
    if (!user || !user.username) {
      try {
        user = await fetchUser(token);
        await saveUser(user);
      } catch (error) {
        console.error('Failed to fetch user:', error);
        // Fall back to stored user
        user = await getStoredUser();
      }
    }

    if (user) {
      displayUser(user);
      showSection(elements.userSection);
    } else {
      showSection(elements.authSection);
    }
  } catch (error) {
    console.error('Initialize error:', error);
    elements.errorText.textContent = 'An error occurred. Please try again.';
    showSection(elements.errorSection);
  }
}

// Listen for token from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'tokenReceived') {
    saveToken(request.token).then(() => {
      initializeApp();
    });
  }
});

// Initialize on popup open
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});
