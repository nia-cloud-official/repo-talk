import express from "express";
import axios from "axios";
import db from "../db.js";
import { authMiddleware, generateToken } from "../middleware/auth.js";

const router = express.Router();

// ── GitHub OAuth callback ───────────────────────────────────────────────────────
// Called by the extension with GitHub OAuth code
router.post("/github/callback", async (req, res) => {
  const { code, redirect_uri } = req.body;

  if (!code) {
    return res.status(400).json({ error: "Missing code" });
  }

  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    return res.status(500).json({
      error: "Server missing GitHub credentials in .env",
    });
  }

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri,
      },
      {
        headers: { Accept: "application/json" },
      }
    );

    const { access_token } = tokenResponse.data;

    // Get user details from GitHub
    const userResponse = await axios.get("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const githubUser = userResponse.data;
    const githubId = githubUser.id.toString();
    const username = githubUser.login;
    const avatarUrl = githubUser.avatar_url;

    // Upsert into our DB
    const dbUser = db
      .prepare(
        `
      INSERT INTO users (github_id, username, avatar_url)
      VALUES (?, ?, ?)
      ON CONFLICT(github_id) DO UPDATE SET
        username   = excluded.username,
        avatar_url = excluded.avatar_url,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, github_id, username, avatar_url
    `,
      )
      .get(githubId, username, avatarUrl);

    // Issue our own JWT for socket authentication
    const appToken = generateToken(dbUser);
    res.json({
      token: appToken,
      user: {
        id: dbUser.id,
        username: dbUser.username,
        avatar_url: dbUser.avatar_url,
      },
    });
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error("GitHub OAuth error:", detail);
    res.status(401).json({ error: "GitHub OAuth failed" });
  }
});

// ── Utility endpoints ─────────────────────────────────────────────────────────
router.get("/me", authMiddleware, (req, res) => {
  const user = db
    .prepare(
      "SELECT id, github_id, username, avatar_url FROM users WHERE id = ?",
    )
    .get(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

router.get("/verify", authMiddleware, (req, res) => {
  res.json({ valid: true, user: req.user });
});

export default router;
