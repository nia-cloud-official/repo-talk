const BACKEND_URL = process.env.BACKEND_URL;
const CLERK_PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY;

const loadingEl = document.getElementById("loading");
const signedOutEl = document.getElementById("signed-out");
const signedInEl = document.getElementById("signed-in");
const signInBtn = document.getElementById("sign-in-btn");
const signOutBtn = document.getElementById("sign-out-btn");
const userAvatar = document.getElementById("user-avatar");
const userName = document.getElementById("user-name");
const userHandle = document.getElementById("user-handle");

let clerk = null;

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

async function initClerk() {
  if (!CLERK_PUBLISHABLE_KEY) {
    console.error("CLERK_PUBLISHABLE_KEY not configured");
    return null;
  }

  try {
    // Load Clerk SDK dynamically
    const { createClerkClient } = await import(
      "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js"
    );
    
    clerk = createClerkClient(CLERK_PUBLISHABLE_KEY);
    return clerk;
  } catch (err) {
    console.error("Failed to load Clerk SDK:", err);
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

    // Open Clerk sign-in modal
    await clerkInstance.signIn.create({
      redirectUrl: chrome.identity.getRedirectURL(),
    });

    // After successful sign-in, get the token
    const session = clerkInstance.session;
    if (session) {
      const token = await session.getToken();
      
      // Verify with backend and get app token
      const res = await fetch(`${BACKEND_URL}/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
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

// Re-render if background updates the token (e.g. after login)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "token" in changes) render();
});

render();
