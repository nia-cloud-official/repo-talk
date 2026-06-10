(() => {
  // src/popup.js
  var BACKEND_URL = "http://localhost:3000";
  var CLERK_PUBLISHABLE_KEY = "pk_test_aW52aXRpbmctZ2xvd3dvcm0tMjMuY2xlcmsuYWNjb3VudHMuZGV2JA";
  var loadingEl = document.getElementById("loading");
  var signedOutEl = document.getElementById("signed-out");
  var signedInEl = document.getElementById("signed-in");
  var signInBtn = document.getElementById("sign-in-btn");
  var signOutBtn = document.getElementById("sign-out-btn");
  var userAvatar = document.getElementById("user-avatar");
  var userName = document.getElementById("user-name");
  var userHandle = document.getElementById("user-handle");
  var clerk = null;
  function show(el) {
    [loadingEl, signedOutEl, signedInEl].forEach(
      (e) => e.style.display = "none"
    );
    el.style.display = "block";
  }
  async function getToken() {
    return new Promise(
      (r) => chrome.storage.local.get(["token"], (s) => r(s.token || null))
    );
  }
  async function fetchUser(token) {
    try {
      const res = await fetch(`${BACKEND_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.ok ? res.json() : null;
    } catch {
      return null;
    }
  }
  async function initClerk() {
    if (!CLERK_PUBLISHABLE_KEY) {
      console.error("CLERK_PUBLISHABLE_KEY not configured");
      return null;
    }
    if (!window.Clerk) {
      await new Promise((resolve) => {
        if (window.ClerkLoaded) {
          resolve();
        } else {
          window.addEventListener("ClerkLoaded", resolve);
          setTimeout(resolve, 5e3);
        }
      });
    }
    if (!window.Clerk) {
      console.error("Clerk SDK failed to load");
      return null;
    }
    try {
      clerk = window.Clerk(CLERK_PUBLISHABLE_KEY);
      await clerk.load();
      return clerk;
    } catch (err) {
      console.error("Failed to initialize Clerk:", err);
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
    try {
      const clerkInstance = await initClerk();
      if (!clerkInstance) {
        throw new Error("Failed to initialize Clerk");
      }
      await clerkInstance.signIn.create();
      const session = clerkInstance.session;
      if (session) {
        const token = await session.getToken();
        const res = await fetch(`${BACKEND_URL}/auth/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Server error ${res.status}`);
        }
        const { token: appToken, user } = await res.json();
        await chrome.storage.local.set({ token: appToken, user });
        render();
      }
    } catch (err) {
      console.error("Login failed:", err.message);
      show(signedOutEl);
    }
  });
  signOutBtn?.addEventListener("click", async () => {
    if (clerk) {
      await clerk.signOut();
    }
    await chrome.storage.local.remove(["token", "user"]);
    show(signedOutEl);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && "token" in changes) render();
  });
  render();
})();
//# sourceMappingURL=popup.js.map
