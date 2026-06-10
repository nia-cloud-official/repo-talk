import jwt from "jsonwebtoken";
import {
  createClerkClient,
  verifyToken as clerkVerifyToken,
} from "@clerk/backend";
import db from "../db.js";

const JWT_SECRET = process.env.JWT_SECRET || "change_this_in_production";

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

// ── Our own JWT (7-day) ───────────────────────────────────────────────────────
export function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: "7d",
  });
}

// ── HTTP middleware (our JWT) ─────────────────────────────────────────────────
export function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(decoded.id);
    if (!user) return res.status(401).json({ error: "User not found" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ── Socket middleware (our JWT, synchronous) ──────────────────────────────────
export function socketAuthMiddleware(socket, next) {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("No token provided"));

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(decoded.id);
    if (!user) return next(new Error("User not found"));
    socket.user = user;
    next();
  } catch {
    return next(new Error("Invalid or expired token"));
  }
}

// ── Clerk → our JWT exchange (used once after GitHub OAuth) ───────────────────
async function getOrSyncUser(clerkUserId) {
  let user = db
    .prepare("SELECT * FROM users WHERE clerk_id = ?")
    .get(clerkUserId);
  if (!user) {
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    const gh = clerkUser.externalAccounts?.find(
      (a) => a.provider === "oauth_github",
    );
    const username =
      gh?.username || clerkUser.username || `user_${clerkUserId.slice(-8)}`;
    const avatarUrl = clerkUser.imageUrl || null;

    user = db
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
      .get(clerkUserId, username, avatarUrl);
  }
  return user;
}

export async function exchangeClerkToken(req, res) {
  const clerkToken = req.headers.authorization?.split(" ")[1];
  if (!clerkToken)
    return res.status(401).json({ error: "No Clerk token provided" });

  try {
    const payload = await clerkVerifyToken(clerkToken, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    const user = await getOrSyncUser(payload.sub);
    const token = generateToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        avatar_url: user.avatar_url,
      },
    });
  } catch (err) {
    console.error("Clerk exchange error:", err.message);
    res.status(401).json({ error: "Invalid Clerk token" });
  }
}
