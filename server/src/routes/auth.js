import express from "express";
import db from "../db.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

// Get current user info from our DB
router.get("/me", authMiddleware, (req, res) => {
  try {
    const user = db
      .prepare(
        "SELECT id, clerk_id, username, avatar_url FROM users WHERE id = ?",
      )
      .get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// Verify token validity (used by the extension to check if still authenticated)
router.get("/verify", authMiddleware, (req, res) => {
  res.json({ valid: true, user: req.user });
});

export default router;
