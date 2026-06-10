import express from "express";
import db from "../db.js";
import { authMiddleware, exchangeClerkToken } from "../middleware/auth.js";

const router = express.Router();

const PK = process.env.CLERK_PUBLISHABLE_KEY || "";
const API = process.env.CLERK_FRONTEND_API || "https://clerk.accounts.dev";

// Inline HTML helper — avoids a template engine dependency
function page(title, bodyScript) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} — Repo Talk</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           display:flex; align-items:center; justify-content:center;
           min-height:100vh; margin:0; background:#f6f8fa; color:#24292e; }
    #root { max-width:420px; width:100%; padding:32px 24px;
            background:#fff; border-radius:8px;
            box-shadow:0 1px 3px rgba(0,0,0,.12); }
    p { margin:0; font-size:14px; color:#666; }
  </style>
</head>
<body>
  <div id="root"><p>Loading…</p></div>
  <script
    async crossorigin="anonymous"
    data-clerk-publishable-key="${PK}"
    src="${API}/npm/@clerk/clerk-js@5/dist/clerk.browser.js"
    onload="(${bodyScript})()"
  ></script>
</body>
</html>`;
}

// ── Step 1: sign-in page ──────────────────────────────────────────────────────
// The user opens this in a tab. Clerk mounts the sign-in UI here.
router.get("/start", (_req, res) => {
  res.send(
    page(
      "Sign in",
      `async function() {
    const clerk = window.Clerk;
    await clerk.load();
    if (clerk.user) {
      window.location.href = '/auth/done';
    } else {
      const el = document.getElementById('root');
      el.innerHTML = '';
      clerk.mountSignIn(el, {
        afterSignInUrl:  '/auth/done',
        afterSignUpUrl:  '/auth/done',
      });
    }
  }`,
    ),
  );
});

// ── Step 2: exchange page ─────────────────────────────────────────────────────
// Clerk redirects here after GitHub OAuth. We grab the Clerk session token,
// exchange it for our own 7-day JWT, then set a short-lived cookie the
// background service worker can read.
router.get("/done", (_req, res) => {
  res.send(
    page(
      "Completing sign in",
      `async function() {
    const clerk = window.Clerk;
    await clerk.load();
    const root = document.getElementById('root');

    if (!clerk.session) {
      root.innerHTML = '<p>No session found — please try again.</p>';
      return;
    }

    try {
      const clerkToken = await clerk.session.getToken();
      const r = await fetch('/auth/exchange-token', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + clerkToken },
      });
      if (!r.ok) throw new Error('Exchange failed (' + r.status + ')');
      const { token } = await r.json();

      // Cookie readable by the extension background (HttpOnly:false so JS can set it)
      document.cookie = 'repo_talk_token=' + token + '; path=/; max-age=120; SameSite=Lax';

      root.innerHTML = '<p style="text-align:center;font-size:32px">✅</p><p style="text-align:center"><strong>Signed in!</strong><br>This tab will close automatically.</p>';
      setTimeout(() => window.close(), 1800);
    } catch (e) {
      root.innerHTML = '<p>Error: ' + e.message + '</p>';
    }
  }`,
    ),
  );
});

// ── Step 3: server-side exchange ──────────────────────────────────────────────
// Verifies the Clerk JWT, syncs the user to our DB, returns our own JWT.
router.post("/exchange-token", exchangeClerkToken);

// ── Utility endpoints ─────────────────────────────────────────────────────────
router.get("/me", authMiddleware, (req, res) => {
  const user = db
    .prepare(
      "SELECT id, clerk_id, username, avatar_url FROM users WHERE id = ?",
    )
    .get(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

router.get("/verify", authMiddleware, (req, res) => {
  res.json({ valid: true, user: req.user });
});

export default router;
