require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

// ─── In-memory user store ────────────────────────────────────────────────────
// Each user: { id, username, position: {x,y}, connections: Set<userId> }
const users = new Map();

const PROXIMITY_RADIUS = 150;
const CANVAS_W = 1200;
const CANVAS_H = 700;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function distance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function getRoomId(a, b) {
  return [a, b].sort().join('--');
}

function checkProximity(userId) {
  const user = users.get(userId);
  if (!user) return;

  users.forEach((other, otherId) => {
    if (otherId === userId) return;

    const dist = distance(user.position, other.position);
    const inRange = dist < PROXIMITY_RADIUS;
    const alreadyConnected = user.connections.has(otherId);

    if (inRange && !alreadyConnected) {
      // ── Connect ──────────────────────────────────────────────────────────
      user.connections.add(otherId);
      other.connections.add(userId);

      const roomId = getRoomId(userId, otherId);

      const userSocket = io.sockets.sockets.get(userId);
      const otherSocket = io.sockets.sockets.get(otherId);
      userSocket?.join(roomId);
      otherSocket?.join(roomId);

      io.to(userId).emit('proximity:connect', {
        userId: otherId,
        username: other.username,
        roomId,
      });
      io.to(otherId).emit('proximity:connect', {
        userId,
        username: user.username,
        roomId,
      });
    } else if (!inRange && alreadyConnected) {
      // ── Disconnect ───────────────────────────────────────────────────────
      user.connections.delete(otherId);
      other.connections.delete(userId);

      const roomId = getRoomId(userId, otherId);

      io.sockets.sockets.get(userId)?.leave(roomId);
      io.sockets.sockets.get(otherId)?.leave(roomId);

      io.to(userId).emit('proximity:disconnect', { userId: otherId, roomId });
      io.to(otherId).emit('proximity:disconnect', { userId, roomId });
    }
  });
}

function cleanupUser(socketId) {
  const user = users.get(socketId);
  if (!user) return;

  user.connections.forEach((otherId) => {
    const other = users.get(otherId);
    if (other) {
      other.connections.delete(socketId);
      const roomId = getRoomId(socketId, otherId);
      io.to(otherId).emit('proximity:disconnect', { userId: socketId, roomId });
    }
  });

  users.delete(socketId);
  io.emit('user:left', { userId: socketId });
  console.log(`[LEAVE] ${user.username} disconnected`);
}

// ─── Socket.IO Events ────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[CONNECT] ${socket.id}`);

  // ── Join ──────────────────────────────────────────────────────────────────
  socket.on('user:join', ({ username }) => {
    const user = {
      id: socket.id,
      username: username?.trim() || `Guest_${socket.id.slice(0, 4)}`,
      position: {
        x: Math.random() * (CANVAS_W - 200) + 100,
        y: Math.random() * (CANVAS_H - 200) + 100,
      },
      connections: new Set(),
    };

    users.set(socket.id, user);

    // Send this user their own data
    socket.emit('user:joined', {
      userId: socket.id,
      username: user.username,
      position: user.position,
    });

    // Send all currently online users to the newcomer
    const existing = [];
    users.forEach((u, id) => {
      if (id !== socket.id) {
        existing.push({ userId: id, username: u.username, position: u.position });
      }
    });
    socket.emit('users:existing', existing);

    // Broadcast newcomer to everyone else
    socket.broadcast.emit('user:new', {
      userId: socket.id,
      username: user.username,
      position: user.position,
    });

    console.log(`[JOIN] ${user.username}`);
  });

  // ── Move ──────────────────────────────────────────────────────────────────
  socket.on('user:move', ({ position }) => {
    const user = users.get(socket.id);
    if (!user) return;

    // Clamp to canvas bounds (safety guard)
    user.position = {
      x: Math.max(0, Math.min(CANVAS_W, position.x)),
      y: Math.max(0, Math.min(CANVAS_H, position.y)),
    };

    socket.broadcast.emit('user:moved', {
      userId: socket.id,
      position: user.position,
    });

    checkProximity(socket.id);
  });

  // ── Chat message ──────────────────────────────────────────────────────────
  socket.on('chat:message', ({ roomId, message }) => {
    const user = users.get(socket.id);
    if (!user || !message?.trim()) return;

    io.to(roomId).emit('chat:message', {
      roomId,
      userId: socket.id,
      username: user.username,
      message: message.trim(),
      timestamp: new Date().toISOString(),
    });
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on('disconnect', () => cleanupUser(socket.id));
});

// ─── REST health check ───────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', users: users.size }));

// ─── MongoDB (optional — app works fine without it) ──────────────────────────
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/virtual-cosmos';
mongoose
  .connect(MONGO_URI)
  .then(() => console.log('[DB] MongoDB connected'))
  .catch(() => console.log('[DB] Running without MongoDB (in-memory only)'));

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[SERVER] Listening on http://localhost:${PORT}`);
});
