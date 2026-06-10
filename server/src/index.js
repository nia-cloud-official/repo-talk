import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

import db from './db.js';
import { initializeSocket } from './socket.js';
import authRoutes from './routes/auth.js';
import roomRoutes from './routes/rooms.js';
import groupRoutes from './routes/groups.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new SocketIO(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://github.com',
    'https://www.github.com',
    /^chrome-extension:\/\/.*/, // Allow all Chrome extensions
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

// Routes
app.use('/auth', authRoutes);
app.use('/', roomRoutes);
app.use('/', groupRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.io initialization
initializeSocket(io);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║     GitHub Collaboration Live Chat - Backend Server       ║
╠═══════════════════════════════════════════════════════════╣
║ ✓ Server running on http://localhost:${PORT}
║ ✓ WebSocket ready for real-time chat
║ ✓ SQLite database initialized
║
║ Environment: ${process.env.NODE_ENV || 'development'}
║ Database: ${process.env.DB_PATH || './data/database.sqlite'}
╚═══════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down gracefully...');
  httpServer.close(() => {
    db.close();
    console.log('Server stopped');
    process.exit(0);
  });
});
