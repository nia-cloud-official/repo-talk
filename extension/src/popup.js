// Popup — reads our own JWT from storage. No Clerk needed here.

const BACKEND_URL = process.env.BACKEND_URL;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const loadingEl = document.getElementById("loading");
const signedOutEl = document.getElementById("signed-out");
const signedInEl = document.getElementById("signed-in");
const signInBtn = document.getElementById("sign-in-btn");
const signOutBtn = document.getElementById("sign-out-btn");
const userAvatar = document.getElementById("user-avatar");
const userName = document.getElementById("user-name");
const userHandle = document.getElementById("user-handle");

function show(el) {
  [loadingEl, signedOutEl, signedInEl].forEach(
    (e) => (e.style.display = "none"),
  );
  el.style.display = "block";
}

async function getToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["token"], (r) => resolve(r.token || null));
  });
}

async function fetchUser(token) {
  try {
    const res = await fetch(`${BACKEND_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

async function render() {
  show(loadingEl);
  const token = await getToken();

  if (!token) {
    show(signedOutEl);
    return;
  }

  const user = await fetchUser(token);
  if (!user) {
    // Token expired or invalid — clear it
    await chrome.storage.local.remove(["token"]);
    show(signedOutEl);
    return;
  }

  userName.textContent = user.username;
  userHandle.textContent = `@${user.username}`;
  userAvatar.src = user.avatar_url || "";
  show(signedInEl);
}

// ── Events ────────────────────────────────────────────────────────────────────
signInBtn?.addEventListener("click", () => {
  chrome.tabs.create({ url: `${BACKEND_URL}/auth/start` });
});

signOutBtn?.addEventListener("click", async () => {
  await chrome.storage.local.remove(["token"]);
  show(signedOutEl);
});

// Re-render when the background writes the token after auth completes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "token" in changes) render();
});

// Init
render();
