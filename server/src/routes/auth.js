import express from 'express';
import axios from 'axios';
import db from '../db.js';
import { generateToken, authMiddleware } from '../middleware/auth.js';

const router = express.Router();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Step 1: Redirect to GitHub OAuth
router.get('/github/login', (req, res) => {
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(GITHUB_CALLBACK_URL)}&scope=user:email,read:repo_hook`;
  res.redirect(githubAuthUrl);
});

// Step 2: GitHub OAuth callback
router.get('/github/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'No code provided' });
  }

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      },
      { headers: { Accept: 'application/json' } }
    );

    const { access_token } = tokenResponse.data;

    if (!access_token) {
      return res.status(400).json({ error: 'Failed to get access token' });
    }

    // Fetch user info from GitHub
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const { id: github_id, login: username, avatar_url, email } = userResponse.data;

    // Upsert user into database
    const stmt = db.prepare(`
      INSERT INTO users (github_id, username, avatar_url, email)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(github_id) DO UPDATE SET
        username = excluded.username,
        avatar_url = excluded.avatar_url,
        email = excluded.email,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, github_id, username, avatar_url
    `);

    const user = stmt.get(github_id, username, avatar_url, email);

    // Generate JWT
    const token = generateToken(user);

    // Redirect back to extension with token
    const extensionUrl = `${process.env.EXTENSION_URL || 'chrome-extension://EXTENSION_ID'}?token=${token}`;
    res.redirect(extensionUrl);
  } catch (error) {
    console.error('GitHub OAuth error:', error.message);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Get current user info
router.get('/me', authMiddleware, (req, res) => {
  try {
    const stmt = db.prepare('SELECT id, github_id, username, avatar_url, email FROM users WHERE id = ?');
    const user = stmt.get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Verify token (for extension)
router.get('/verify', authMiddleware, (req, res) => {
  res.json({ valid: true, user: req.user });
});

export default router;
