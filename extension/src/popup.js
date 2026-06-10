import { createClerkClient } from '@clerk/chrome-extension/client';

const PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY;
const EXTENSION_URL = chrome.runtime.getURL('.');
const POPUP_URL = `${EXTENSION_URL}popup.html`;

const clerk = createClerkClient({ publishableKey: PUBLISHABLE_KEY });

// ── DOM refs ──────────────────────────────────────────────────────────────────
const loadingEl   = document.getElementById('loading');
const signedOutEl = document.getElementById('signed-out');
const signedInEl  = document.getElementById('signed-in');
const signInBtn   = document.getElementById('sign-in-btn');
const signOutBtn  = document.getElementById('sign-out-btn');
const userAvatar  = document.getElementById('user-avatar');
const userName    = document.getElementById('user-name');
const userHandle  = document.getElementById('user-handle');

// ── Helpers ───────────────────────────────────────────────────────────────────
function getGitHubUsername(user) {
  const gh = user.externalAccounts?.find((a) => a.provider === 'oauth_github');
  return gh?.username || user.username || 'User';
}

function show(el) {
  [loadingEl, signedOutEl, signedInEl].forEach((e) => (e.style.display = 'none'));
  el.style.display = 'block';
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  if (!clerk.loaded) {
    show(loadingEl);
    return;
  }

  if (clerk.user) {
    const username = getGitHubUsername(clerk.user);
    userName.textContent   = username;
    userHandle.textContent = `@${username}`;
    userAvatar.src         = clerk.user.imageUrl || '';
    show(signedInEl);
  } else {
    show(signedOutEl);
  }
}

// ── Event handlers ────────────────────────────────────────────────────────────
signInBtn.addEventListener('click', () => {
  clerk.openSignIn({});
});

signOutBtn.addEventListener('click', () => {
  clerk.signOut({ redirectUrl: POPUP_URL });
});

// ── Init ──────────────────────────────────────────────────────────────────────
clerk
  .load({
    afterSignOutUrl: POPUP_URL,
    signInForceRedirectUrl: POPUP_URL,
    signUpForceRedirectUrl: POPUP_URL,
    allowedRedirectProtocols: ['chrome-extension:'],
  })
  .then(() => {
    clerk.addListener(render);
    render();
  });
