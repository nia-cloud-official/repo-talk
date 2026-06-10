const BACKEND_URL = process.env.BACKEND_URL;

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
  return new Promise((r) =>
    chrome.storage.local.get(["token"], (s) => r(s.token || null)),
  );
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
    await chrome.storage.local.remove(["token", "user"]);
    show(signedOutEl);
    return;
  }

  userName.textContent = user.username;
  userHandle.textContent = `@${user.username}`;
  userAvatar.src = user.avatar_url || "";
  show(signedInEl);
}

signInBtn?.addEventListener("click", async () => {
  show(loadingEl);
  const result = await chrome.runtime.sendMessage({ action: "login" });
  if (result?.success) {
    render();
  } else {
    console.error("Login failed:", result?.error);
    show(signedOutEl);
  }
});

signOutBtn?.addEventListener("click", async () => {
  await chrome.storage.local.remove(["token", "user"]);
  show(signedOutEl);
});

// Re-render if background updates the token (e.g. after login)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "token" in changes) render();
});

render();
