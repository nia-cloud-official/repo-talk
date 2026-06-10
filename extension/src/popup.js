import { Clerk } from "@clerk/clerk-js";

const PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY;
const EXTENSION_URL = chrome.runtime.getURL(".");
const POPUP_URL = `${EXTENSION_URL}popup.html`;
const AUTH_URL = `${POPUP_URL}?auth=1`; // full-tab auth page

const clerk = new Clerk(PUBLISHABLE_KEY);
const isAuthTab = new URLSearchParams(window.location.search).has("auth");

// ── DOM refs ──────────────────────────────────────────────────────────────────
const loadingEl = document.getElementById("loading");
const signedOutEl = document.getElementById("signed-out");
const signedInEl = document.getElementById("signed-in");
const signInBtn = document.getElementById("sign-in-btn");
const signOutBtn = document.getElementById("sign-out-btn");
const userAvatar = document.getElementById("user-avatar");
const userName = document.getElementById("user-name");
const userHandle = document.getElementById("user-handle");

// ── Helpers ───────────────────────────────────────────────────────────────────
function getGitHubUsername(user) {
  const gh = user.externalAccounts?.find((a) => a.provider === "oauth_github");
  return gh?.username || user.username || "User";
}

function show(el) {
  [loadingEl, signedOutEl, signedInEl].forEach(
    (e) => (e.style.display = "none"),
  );
  el.style.display = "block";
}

function render() {
  if (!clerk.loaded) {
    show(loadingEl);
    return;
  }
  if (clerk.user) {
    const username = getGitHubUsername(clerk.user);
    userName.textContent = username;
    userHandle.textContent = `@${username}`;
    userAvatar.src = clerk.user.imageUrl || "";
    show(signedInEl);
  } else {
    show(signedOutEl);
  }
}

// ── Auth-tab mode ─────────────────────────────────────────────────────────────
// popup.html?auth=1 is opened as a full browser tab.
// In a full tab, OAuth redirects work normally (no popup lifecycle issues).
if (isAuthTab) {
  clerk
    .load({
      allowedRedirectProtocols: ["chrome-extension:"],
      signInForceRedirectUrl: AUTH_URL,
      signUpForceRedirectUrl: AUTH_URL,
      afterSignInUrl: AUTH_URL,
      afterSignUpUrl: AUTH_URL,
    })
    .then(() => {
      if (clerk.user) {
        // OAuth completed and Clerk redirected back here — session is set.
        document.body.innerHTML = `
          <div style="
            display:flex; flex-direction:column; align-items:center;
            justify-content:center; height:100vh;
            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
            color:#24292e; gap:12px;
          ">
            <div style="font-size:40px">✅</div>
            <strong style="font-size:16px">Signed in successfully!</strong>
            <span style="color:#666;font-size:13px">You can close this tab.</span>
          </div>
        `;
        // Auto-close after 2 s
        setTimeout(() => window.close(), 2000);
      } else {
        // Start the OAuth flow — navigates this tab to Clerk's hosted sign-in,
        // which redirects back here after GitHub auth completes.
        clerk.redirectToSignIn({ redirectUrl: AUTH_URL });
      }
    });

  // ── Normal popup mode ─────────────────────────────────────────────────────────
} else {
  // Sign-in opens a full tab so OAuth can complete without popup constraints.
  signInBtn?.addEventListener("click", () => {
    chrome.tabs.create({ url: AUTH_URL });
  });

  signOutBtn?.addEventListener("click", () => {
    clerk.signOut().then(render);
  });

  clerk
    .load({
      afterSignOutUrl: POPUP_URL,
      signInForceRedirectUrl: AUTH_URL,
      signUpForceRedirectUrl: AUTH_URL,
      allowedRedirectProtocols: ["chrome-extension:"],
    })
    .then(() => {
      clerk.addListener(render);
      render();
    });
}
