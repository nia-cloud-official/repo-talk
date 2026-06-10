import jwt from "jsonwebtoken";
import { createClerkClient } from "@clerk/backend";
import db from "../db.js";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const JWT_SECRET = process.env.JWT_SECRET || "change_this_in_production";

export function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: "7d",
  });
}

// Internal app JWT middleware (for tokens issued after Clerk verification)
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

// Clerk JWT middleware (for verifying Clerk tokens directly)
export async function clerkAuthMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });

  try {
    const payload = await clerk.verifyToken(token);
    if (!payload || !payload.sub) {
      return res.status(401).json({ error: "Invalid Clerk token" });
    }
    
    const user = db.prepare("SELECT * FROM users WHERE clerk_id = ?").get(payload.sub);
    if (!user) return res.status(401).json({ error: "User not found in database" });
    
    req.user = user;
    req.clerkPayload = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired Clerk token" });
  }
}

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
