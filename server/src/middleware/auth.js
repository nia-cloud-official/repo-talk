import { createClerkClient, verifyToken } from "@clerk/backend";
import db from "../db.js";

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

// Fetch Clerk user info and upsert into local DB, returns our internal user record
async function getOrSyncUser(clerkUserId) {
  let user = db
    .prepare("SELECT * FROM users WHERE clerk_id = ?")
    .get(clerkUserId);

  if (!user) {
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    const githubAccount = clerkUser.externalAccounts?.find(
      (a) => a.provider === "oauth_github",
    );
    const username =
      githubAccount?.username ||
      clerkUser.username ||
      `user_${clerkUserId.slice(-8)}`;
    const avatarUrl = clerkUser.imageUrl || null;

    const stmt = db.prepare(`
      INSERT INTO users (clerk_id, username, avatar_url)
      VALUES (?, ?, ?)
      ON CONFLICT(clerk_id) DO UPDATE SET
        username = excluded.username,
        avatar_url = excluded.avatar_url,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, clerk_id, username, avatar_url
    `);

    user = stmt.get(clerkUserId, username, avatarUrl);
  }

  return user;
}

export async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    const user = await getOrSyncUser(payload.sub);
    req.user = user;
    next();
  } catch (error) {
    console.error("Auth error:", error.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export async function socketAuthMiddleware(socket, next) {
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error("No token provided"));
  }

  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    const user = await getOrSyncUser(payload.sub);
    socket.user = user;
    next();
  } catch (error) {
    return next(new Error("Invalid or expired token"));
  }
}
