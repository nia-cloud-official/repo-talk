import express from 'express';
import axios from 'axios';
import db from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { sanitizeGroupName } from '../utils/sanitize.js';

const router = express.Router();

// Create a new group
router.post('/groups/create', authMiddleware, async (req, res) => {
  try {
    const { name, description, repo_owner, repo_name, members } = req.body;
    const creator_id = req.user.id;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const sanitizedName = sanitizeGroupName(name);
    const room_id = `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create group
    const groupStmt = db.prepare(`
      INSERT INTO groups (name, description, creator_id, repo_owner, repo_name, room_id)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING id, name, room_id, created_at
    `);

    const group = groupStmt.get(
      sanitizedName,
      description || null,
      creator_id,
      repo_owner || null,
      repo_name || null,
      room_id
    );

    // Create room for group
    const roomStmt = db.prepare(`
      INSERT INTO rooms (room_id, repo_owner, repo_name)
      VALUES (?, ?, ?)
    `);

    roomStmt.run(room_id, repo_owner || 'group', repo_name || sanitizedName);

    // Add creator as member
    const memberStmt = db.prepare(`
      INSERT INTO group_members (group_id, user_id, github_username, role)
      VALUES (?, ?, ?, 'admin')
    `);

    memberStmt.run(group.id, creator_id, req.user.username);

    // Add invited members (optional)
    if (Array.isArray(members) && members.length > 0) {
      const inviteStmt = db.prepare(`
        INSERT OR IGNORE INTO group_members (group_id, user_id, github_username, role)
        VALUES (?, ?, ?, 'member')
      `);

      for (const member of members) {
        // Look up user by username
        const userLookup = db.prepare('SELECT id FROM users WHERE username = ?').get(member);
        if (userLookup) {
          inviteStmt.run(group.id, userLookup.id, member);
        }
      }
    }

    res.status(201).json(group);
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// Get all groups for user
router.get('/groups', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;

    const stmt = db.prepare(`
      SELECT g.id, g.name, g.description, g.creator_id, g.repo_owner, g.repo_name, g.room_id, g.created_at,
             (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count,
             (SELECT COUNT(*) FROM messages WHERE room_id = g.room_id) as message_count
      FROM groups g
      WHERE g.id IN (
        SELECT group_id FROM group_members WHERE user_id = ?
      )
      ORDER BY g.created_at DESC
    `);

    const groups = stmt.all(userId);

    res.json({ groups });
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// Get single group details
router.get('/groups/:groupId', authMiddleware, (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    // Check if user is member
    const isMember = db.prepare(`
      SELECT id FROM group_members WHERE group_id = ? AND user_id = ?
    `).get(groupId, userId);

    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    // Get group details
    const groupStmt = db.prepare(`
      SELECT id, name, description, creator_id, repo_owner, repo_name, room_id, created_at
      FROM groups
      WHERE id = ?
    `);

    const group = groupStmt.get(groupId);

    // Get members
    const membersStmt = db.prepare(`
      SELECT gm.user_id, gm.github_username, gm.role, gm.joined_at, u.avatar_url
      FROM group_members gm
      LEFT JOIN users u ON gm.user_id = u.id
      WHERE gm.group_id = ?
      ORDER BY gm.joined_at ASC
    `);

    const members = membersStmt.all(groupId);

    res.json({ group, members });
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({ error: 'Failed to fetch group' });
  }
});

// Add member to group
router.post('/groups/:groupId/invite', authMiddleware, (req, res) => {
  try {
    const { groupId } = req.params;
    const { github_username } = req.body;
    const userId = req.user.id;

    if (!github_username) {
      return res.status(400).json({ error: 'GitHub username required' });
    }

    // Check if user is admin
    const isAdmin = db.prepare(`
      SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND role = 'admin'
    `).get(groupId, userId);

    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can invite members' });
    }

    // Look up user
    const targetUser = db.prepare('SELECT id FROM users WHERE username = ?').get(github_username);

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Add member
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO group_members (group_id, user_id, github_username, role)
      VALUES (?, ?, ?, 'member')
    `);

    stmt.run(groupId, targetUser.id, github_username);

    res.json({ success: true, message: 'Member invited' });
  } catch (error) {
    console.error('Invite member error:', error);
    res.status(500).json({ error: 'Failed to invite member' });
  }
});

// Remove member from group
router.delete('/groups/:groupId/members/:memberId', authMiddleware, (req, res) => {
  try {
    const { groupId, memberId } = req.params;
    const userId = req.user.id;

    // Check if user is admin
    const isAdmin = db.prepare(`
      SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND role = 'admin'
    `).get(groupId, userId);

    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can remove members' });
    }

    // Remove member
    const stmt = db.prepare(`
      DELETE FROM group_members WHERE group_id = ? AND user_id = ?
    `);

    stmt.run(groupId, memberId);

    res.json({ success: true, message: 'Member removed' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

export default router;
