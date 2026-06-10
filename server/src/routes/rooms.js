import express from 'express';
import axios from 'axios';
import db from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Helper function to parse room ID
function parseRoomId(roomId) {
  // Format: owner/repo or owner/repo#pr-123 or owner/repo#issue-45
  const match = roomId.match(/^([^/]+)\/([^#]+)(?:#(pr|issue)-(\d+))?$/);
  if (!match) return null;

  return {
    repo_owner: match[1],
    repo_name: match[2],
    type: match[3] || 'repo',
    number: match[4] ? parseInt(match[4]) : null,
  };
}

// Helper function to create or get room
function getOrCreateRoom(roomId, token) {
  const parsed = parseRoomId(roomId);
  if (!parsed) {
    throw new Error('Invalid room ID format');
  }

  // Check if room exists
  let stmt = db.prepare('SELECT * FROM rooms WHERE room_id = ?');
  let room = stmt.get(roomId);

  if (!room) {
    // Create new room
    stmt = db.prepare(`
      INSERT INTO rooms (room_id, repo_owner, repo_name, pr_number, issue_number)
      VALUES (?, ?, ?, ?, ?)
      RETURNING *
    `);

    const pr_number = parsed.type === 'pr' ? parsed.number : null;
    const issue_number = parsed.type === 'issue' ? parsed.number : null;

    room = stmt.get(roomId, parsed.repo_owner, parsed.repo_name, pr_number, issue_number);
  }

  return room;
}

// Get or create room and retrieve recent messages
router.get('/rooms/:owner/:repo', authMiddleware, async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const { pr, issue } = req.query;

    let roomId = `${owner}/${repo}`;
    if (pr) roomId += `#pr-${pr}`;
    if (issue) roomId += `#issue-${issue}`;

    const room = getOrCreateRoom(roomId);

    // Get last 50 messages
    const stmt = db.prepare(`
      SELECT id, room_id, username, avatar_url, content, created_at
      FROM messages
      WHERE room_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `);

    const messages = stmt.all(roomId).reverse();

    res.json({
      room,
      messages,
    });
  } catch (error) {
    console.error('Get room error:', error);
    res.status(500).json({ error: 'Failed to fetch room' });
  }
});

// Get room history (paginated)
router.get('/rooms/:owner/:repo/history', authMiddleware, (req, res) => {
  try {
    const { owner, repo } = req.params;
    const { pr, issue, limit = 50, offset = 0 } = req.query;

    let roomId = `${owner}/${repo}`;
    if (pr) roomId += `#pr-${pr}`;
    if (issue) roomId += `#issue-${issue}`;

    const stmt = db.prepare(`
      SELECT id, room_id, username, avatar_url, content, created_at
      FROM messages
      WHERE room_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);

    const messages = stmt.all(roomId, parseInt(limit), parseInt(offset)).reverse();

    res.json({ messages });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Get all active rooms for a user
router.get('/user/rooms', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;

    // Get rooms where user has posted messages
    const stmt = db.prepare(`
      SELECT DISTINCT r.id, r.room_id, r.repo_owner, r.repo_name, r.pr_number, r.issue_number, r.created_at,
             (SELECT COUNT(*) FROM messages WHERE room_id = r.room_id) as message_count,
             (SELECT created_at FROM messages WHERE room_id = r.room_id ORDER BY created_at DESC LIMIT 1) as last_message_at
      FROM rooms r
      WHERE r.room_id IN (
        SELECT DISTINCT room_id FROM messages WHERE user_id = ?
      )
      ORDER BY last_message_at DESC
    `);

    const rooms = stmt.all(userId);

    res.json({ rooms });
  } catch (error) {
    console.error('Get user rooms error:', error);
    res.status(500).json({ error: 'Failed to fetch user rooms' });
  }
});

export default router;
