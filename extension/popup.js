(() => {
  // src/popup.js
  var BACKEND_URL = "http://localhost:3000";
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
  async function getToken() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["token"], (r) => resolve(r.token || null));
    });
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
      await chrome.storage.local.remove(["token"]);
      show(signedOutEl);
      return;
    }
    userName.textContent = user.username;
    userHandle.textContent = `@${user.username}`;
    userAvatar.src = user.avatar_url || "";
    show(signedInEl);
  }
  signInBtn?.addEventListener("click", () => {
    chrome.tabs.create({ url: `${BACKEND_URL}/auth/start` });
  });
  signOutBtn?.addEventListener("click", async () => {
    await chrome.storage.local.remove(["token"]);
    show(signedOutEl);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && "token" in changes) render();
  });
  render();
})();
//# sourceMappingURL=popup.js.map
