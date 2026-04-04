# 🪐 Virtual Cosmos

A 2D real-time multiplayer virtual space where users move around as avatars and chat with each other automatically based on physical proximity — just like bumping into someone in real life.

> **Live demo:** Open two browser tabs side by side, move the avatars close together, and watch the chat panel appear automatically.

---

## What it does

- Each user gets a coloured avatar on a 2D canvas. Move it with **WASD** or **arrow keys**.
- When two avatars come within **150px** of each other, they're automatically connected and a chat window opens.
- Move apart and the chat closes — no button needed.
- Multiple users can be online at the same time, each with their own proximity zones and chat sessions.

---

## Tech stack

| Layer | Technology | Why |
|---|---|---|
| Frontend canvas | **PixiJS v7** | Handles 2D rendering with a proper game loop and smooth animation |
| Frontend framework | **React 18 + Vite** | Fast dev experience, component-based UI |
| Styling | **Tailwind CSS** | Rapid, consistent styling without a separate CSS file |
| Real-time transport | **Socket.IO** | Reliable WebSocket abstraction; handles reconnection automatically |
| Backend | **Node.js + Express** | Lightweight HTTP + WebSocket server |
| Database | **MongoDB + Mongoose** | Optional — the app runs fully in-memory without it |

---

## Project structure

```
virtual-cosmos/
├── client/                  # React frontend
│   ├── src/
│   │   ├── App.jsx          # Login screen + layout root
│   │   ├── socket.js        # Socket.IO singleton
│   │   └── components/
│   │       ├── CosmosCanvas.jsx   # PixiJS canvas, movement, socket events
│   │       └── ChatPanel.jsx      # Chat sidebar UI
│   ├── index.html
│   ├── vite.config.js
│   └── tailwind.config.js
│
└── server/
    └── index.js             # Express + Socket.IO + proximity logic
```

---

## How proximity detection works

The server holds every user's current `(x, y)` position in memory. Each time a player moves, the server:

1. Updates their stored position.
2. Loops through all other connected users.
3. Computes **Euclidean distance** between the moving player and each other.
4. If `distance < 150` and they weren't already connected → emits `proximity:connect` to both sockets and adds them to a shared Socket.IO room.
5. If `distance >= 150` and they were connected → emits `proximity:disconnect` and removes them from the room.

Chat messages are scoped to that shared room, so only the two connected users receive them.

---

## Getting started

### 1. Clone the repo

```bash
git clone https://github.com/<your-username>/virtual-cosmos.git
cd virtual-cosmos
```

### 2. Start the backend

```bash
cd server
cp .env.example .env       # edit if needed
npm install
npm run dev                # runs on http://localhost:3001
```

MongoDB is optional. If it's not running, the server falls back to in-memory storage — everything still works.

### 3. Start the frontend

```bash
cd client
cp .env.example .env       # VITE_SERVER_URL=http://localhost:3001
npm install
npm run dev                # runs on http://localhost:5173
```

Open **http://localhost:5173** in two tabs to test multiplayer locally.

---

## Environment variables

**server/.env**
```
PORT=3001
MONGODB_URI=mongodb://localhost:27017/virtual-cosmos
CLIENT_URL=http://localhost:5173
```

**client/.env**
```
VITE_SERVER_URL=http://localhost:3001
```

---

## Controls

| Key | Action |
|---|---|
| `W` / `↑` | Move up |
| `S` / `↓` | Move down |
| `A` / `←` | Move left |
| `D` / `→` | Move right |

---

## Socket events reference

| Direction | Event | Payload | Description |
|---|---|---|---|
| Client → Server | `user:join` | `{ username }` | Player enters the cosmos |
| Client → Server | `user:move` | `{ position: {x,y} }` | Position update (~25/sec) |
| Client → Server | `chat:message` | `{ roomId, message }` | Send a chat message |
| Server → Client | `user:joined` | `{ userId, username, position }` | Your own initial state |
| Server → Client | `users:existing` | `[{ userId, username, position }]` | All currently online users |
| Server → Client | `user:new` | `{ userId, username, position }` | Someone just joined |
| Server → Client | `user:moved` | `{ userId, position }` | Another user moved |
| Server → Client | `user:left` | `{ userId }` | User disconnected |
| Server → Client | `proximity:connect` | `{ userId, username, roomId }` | You're now close enough to chat |
| Server → Client | `proximity:disconnect` | `{ userId, roomId }` | You moved apart |
| Server → Client | `chat:message` | `{ roomId, userId, username, message, timestamp }` | Incoming message |

---

## What I'd add next (bonus ideas)

- **User avatars / custom images** instead of coloured circles
- **Multiple proximity zones** — whisper range (50px) and normal range (150px) with different chat styles
- **Persistent chat history** stored in MongoDB per session
- **Rooms / floors** — different canvas areas users can navigate between
- **Audio proximity** — Web Audio API fade-in/fade-out based on distance
- **Mobile touch controls** — virtual joystick for phones

---

## Health check

```
GET http://localhost:3001/health
→ { "status": "ok", "users": 3 }
```
