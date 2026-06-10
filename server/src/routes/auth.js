import express from "express";
import { createClerkClient } from "@clerk/backend";
import crypto from "crypto";
import db from "../db.js";
import { authMiddleware, generateToken } from "../middleware/auth.js";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const router = express.Router();

// ── Clerk token verification ─────────────────────────────────────────────────────
// Called by the extension with a Clerk JWT token
router.post("/verify", async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Missing token" });
  }

  if (!process.env.CLERK_SECRET_KEY) {
    return res.status(500).json({
      error: "Server missing CLERK_SECRET_KEY in .env",
    });
  }

  try {
    // Verify the Clerk JWT token
    const payload = await clerk.verifyToken(token);
    
    if (!payload || !payload.sub) {
      return res.status(401).json({ error: "Invalid token payload" });
    }

    // Get user details from Clerk
    const user = await clerk.users.getUser(payload.sub);
    
    if (!user) {
      return res.status(404).json({ error: "User not found in Clerk" });
    }

    // Extract user data
    const clerkId = user.id;
    const username = user.username || user.firstName || user.emailAddresses[0]?.emailAddress || clerkId;
    const avatarUrl = user.imageUrl || null;

    // Upsert into our DB
    const dbUser = db
      .prepare(
        `
      INSERT INTO users (clerk_id, username, avatar_url)
      VALUES (?, ?, ?)
      ON CONFLICT(clerk_id) DO UPDATE SET
        username   = excluded.username,
        avatar_url = excluded.avatar_url,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, clerk_id, username, avatar_url
    `,
      )
      .get(clerkId, username, avatarUrl);

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
    const detail = err.message || "Token verification failed";
    console.error("Clerk verification error:", detail);
    res.status(401).json({ error: detail });
  }
});

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

// ── Clerk Webhook endpoint ───────────────────────────────────────────────────────
// Handles user sync events from Clerk
router.post("/webhook", async (req, res) => {
  const svix_id = req.headers["svix-id"];
  const svix_timestamp = req.headers["svix-timestamp"];
  const svix_signature = req.headers["svix-signature"];

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return res.status(400).json({ error: "Missing Svix headers" });
  }

  if (!process.env.CLERK_WEBHOOK_SECRET) {
    return res.status(500).json({
      error: "Server missing CLERK_WEBHOOK_SECRET in .env",
    });
  }

  try {
    // Manual webhook signature verification
    const timestamp = svix_timestamp;
    const signature = svix_signature;
    const payload = JSON.stringify(req.body);

    const expectedSignature = crypto
      .createHmac("sha256", process.env.CLERK_WEBHOOK_SECRET)
      .update(`${svix_id}.${timestamp}.${payload}`)
      .digest("base64");

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }

    const eventType = req.body.type;
    const data = req.body.data;

    switch (eventType) {
      case "user.created": {
        const clerkId = data.id;
        const username = data.username || data.first_name || data.email_addresses[0]?.email_address || clerkId;
        const avatarUrl = data.image_url || null;

        db.prepare(
          "INSERT INTO users (clerk_id, username, avatar_url) VALUES (?, ?, ?)"
        ).run(clerkId, username, avatarUrl);
        console.log(`✓ Created user ${username} (Clerk ID: ${clerkId})`);
        break;
      }

      case "user.updated": {
        const clerkId = data.id;
        const username = data.username || data.first_name || data.email_addresses[0]?.email_address || clerkId;
        const avatarUrl = data.image_url || null;

        db.prepare(
          "UPDATE users SET username = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE clerk_id = ?"
        ).run(username, avatarUrl, clerkId);
        console.log(`✓ Updated user ${username} (Clerk ID: ${clerkId})`);
        break;
      }

      case "user.deleted": {
        const clerkId = data.id;
        db.prepare("DELETE FROM users WHERE clerk_id = ?").run(clerkId);
        console.log(`✓ Deleted user (Clerk ID: ${clerkId})`);
        break;
      }

      default:
        console.log(`Unhandled webhook event: ${eventType}`);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(400).json({ error: "Webhook verification failed" });
  }
});

export default router;
