import db from './db.js';
import { socketAuthMiddleware, verifyToken } from './middleware/auth.js';
import { sanitizeMessage, sanitizeRoomId } from './utils/sanitize.js';

const RATE_LIMIT_MESSAGES = 10; // Max messages per minute
const messageCountMap = new Map();

function getRateLimit(userId) {
  const now = Date.now();
  const key = `${userId}-${Math.floor(now / 60000)}`;
  const count = messageCountMap.get(key) || 0;

  if (count >= RATE_LIMIT_MESSAGES) {
    return false;
  }

  messageCountMap.set(key, count + 1);

  // Cleanup old entries
  if (messageCountMap.size > 10000) {
    const oldKey = `${userId}-${Math.floor((now - 120000) / 60000)}`;
    messageCountMap.delete(oldKey);
  }

  return true;
}

export function initializeSocket(io) {
  // Apply authentication middleware
  io.use((socket, next) => {
    socketAuthMiddleware(socket, next);
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.username} (${socket.id})`);

    // Join room
    socket.on('join_room', (data) => {
      const { room_id } = data;
      const sanitizedRoomId = sanitizeRoomId(room_id);

      if (!sanitizedRoomId) {
        socket.emit('error', { message: 'Invalid room ID' });
        return;
      }

      // Get or create room
      let room = db.prepare('SELECT * FROM rooms WHERE room_id = ?').get(sanitizedRoomId);

      if (!room) {
        const stmt = db.prepare(`
          INSERT INTO rooms (room_id, repo_owner, repo_name)
          VALUES (?, ?, ?)
          RETURNING *
        `);

        const parts = sanitizedRoomId.split('/');
        if (parts.length >= 2) {
          room = stmt.get(sanitizedRoomId, parts[0], parts[1]);
        } else {
          socket.emit('error', { message: 'Invalid room format' });
          return;
        }
      }

      // Check if user has access to room
      const isGroupRoom = room.room_id.startsWith('group-');
      if (isGroupRoom) {
        const hasAccess = db.prepare(`
          SELECT id FROM group_members
          WHERE user_id = ? AND group_id = (
            SELECT id FROM groups WHERE room_id = ?
          )
        `).get(socket.user.id, sanitizedRoomId);

        if (!hasAccess) {
          socket.emit('error', { message: 'Access denied to this room' });
          return;
        }
      }

      socket.join(sanitizedRoomId);
      socket.currentRoom = sanitizedRoomId;

      // Get recent messages
      const messages = db.prepare(`
        SELECT id, room_id, username, avatar_url, content, created_at
        FROM messages
        WHERE room_id = ?
        ORDER BY created_at DESC
        LIMIT 50
      `).all(sanitizedRoomId).reverse();

      socket.emit('room_joined', {
        room_id: sanitizedRoomId,
        messages,
      });

      // Notify others
      socket.to(sanitizedRoomId).emit('user_joined', {
        username: socket.user.username,
        user_count: io.sockets.adapter.rooms.get(sanitizedRoomId)?.size || 0,
      });
    });

    // Send message
    socket.on('send_message', (data) => {
      const { content } = data;
      const roomId = socket.currentRoom;

      if (!roomId) {
        socket.emit('error', { message: 'Not in a room' });
        return;
      }

      // Rate limiting
      if (!getRateLimit(socket.user.id)) {
        socket.emit('error', { message: 'Too many messages. Please slow down.' });
        return;
      }

      const sanitizedContent = sanitizeMessage(content);

      if (!sanitizedContent) {
        socket.emit('error', { message: 'Message cannot be empty' });
        return;
      }

      try {
        // Store message in database
        const stmt = db.prepare(`
          INSERT INTO messages (room_id, user_id, username, avatar_url, content)
          VALUES (?, ?, ?, ?, ?)
          RETURNING id, room_id, username, avatar_url, content, created_at
        `);

        const message = stmt.get(
          roomId,
          socket.user.id,
          socket.user.username,
          db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(socket.user.id)?.avatar_url,
          sanitizedContent
        );

        // Broadcast to room
        io.to(roomId).emit('receive_message', message);
      } catch (error) {
        console.error('Save message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Typing indicator
    socket.on('typing', (data) => {
      const roomId = socket.currentRoom;

      if (!roomId) return;

      socket.to(roomId).emit('user_typing', {
        username: socket.user.username,
        avatar_url: socket.user.avatar_url,
      });
    });

    // Leave room
    socket.on('leave_room', () => {
      const roomId = socket.currentRoom;

      if (roomId) {
        socket.leave(roomId);
        socket.to(roomId).emit('user_left', {
          username: socket.user.username,
          user_count: io.sockets.adapter.rooms.get(roomId)?.size || 0,
        });
      }

      socket.currentRoom = null;
    });

    // Disconnect
    socket.on('disconnect', () => {
      const roomId = socket.currentRoom;

      if (roomId) {
        socket.to(roomId).emit('user_left', {
          username: socket.user.username,
          user_count: io.sockets.adapter.rooms.get(roomId)?.size || 0,
        });
      }

      console.log(`User disconnected: ${socket.user.username} (${socket.id})`);
    });

    // Get online users in room
    socket.on('get_online_users', () => {
      const roomId = socket.currentRoom;

      if (!roomId) {
        socket.emit('online_users', []);
        return;
      }

      const room = io.sockets.adapter.rooms.get(roomId);
      const count = room?.size || 0;

      socket.emit('online_users', { count, room_id: roomId });
    });
  });
}
