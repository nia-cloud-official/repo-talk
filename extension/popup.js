(() => {
  // src/popup.js
  var BACKEND_URL = "https://repo-talk.onrender.com";
  var loadingEl = document.getElementById("loading");
  var signedOutEl = document.getElementById("signed-out");
  var signedInEl = document.getElementById("signed-in");
  var signInBtn = document.getElementById("sign-in-btn");
  var signOutBtn = document.getElementById("sign-out-btn");
  var userAvatar = document.getElementById("user-avatar");
  var userName = document.getElementById("user-name");
  var userHandle = document.getElementById("user-handle");
  function show(el) {
    [loadingEl, signedOutEl, signedInEl].forEach(
      (e) => e.style.display = "none"
    );
    el.style.display = "block";
  }
  function getGitHubAvatarUrl(username) {
    return `https://github.com/${username}.png`;
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
    const avatarImg = userAvatar.querySelector("img");
    if (avatarImg) {
      avatarImg.src = getGitHubAvatarUrl(user.username);
    }
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
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && "token" in changes) render();
  });
  render();
})();
//# sourceMappingURL=popup.js.map
