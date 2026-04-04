import { useEffect, useRef, useState, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import { socket } from '../socket';
import ChatPanel from './ChatPanel';

// ─── Constants ────────────────────────────────────────────────────────────────
const CANVAS_W = 1200;
const CANVAS_H = 700;
const PLAYER_RADIUS = 22;
const PROXIMITY_RADIUS = 150;
const SPEED = 3.5;
const EMIT_INTERVAL_MS = 40; // ~25 position updates/sec

// Avatar colour palette – one per user (deterministic from userId)
const PALETTE = [
  0x6366f1, // indigo
  0xec4899, // pink
  0x10b981, // emerald
  0xf59e0b, // amber
  0x3b82f6, // blue
  0xef4444, // red
  0x8b5cf6, // violet
  0x06b6d4, // cyan
  0xf97316, // orange
  0xa3e635, // lime
];

function pickColor(userId) {
  let h = 5381;
  for (let i = 0; i < userId.length; i++) h = (h * 33) ^ userId.charCodeAt(i);
  return PALETTE[Math.abs(h) % PALETTE.length];
}

// ─── Sprite helpers ───────────────────────────────────────────────────────────

function buildUserSprite(app, userId, uname, position, isLocal) {
  const root = new PIXI.Container();
  root.x = position.x;
  root.y = position.y;

  const color = pickColor(userId);

  // Proximity ring (only drawn for the local player so they can see their reach)
  if (isLocal) {
    const ring = new PIXI.Graphics();
    ring.lineStyle(1.5, 0x6366f1, 0.25);
    ring.beginFill(0x6366f1, 0.05);
    ring.drawCircle(0, 0, PROXIMITY_RADIUS);
    ring.endFill();
    root.addChild(ring);
  }

  // Soft glow behind the avatar
  const glow = new PIXI.Graphics();
  glow.beginFill(color, 0.18);
  glow.drawCircle(0, 0, PLAYER_RADIUS + 8);
  glow.endFill();
  root.addChild(glow);

  // Main avatar circle
  const circle = new PIXI.Graphics();
  circle.lineStyle(isLocal ? 2.5 : 1.5, isLocal ? 0xffffff : color, 0.9);
  circle.beginFill(color);
  circle.drawCircle(0, 0, PLAYER_RADIUS);
  circle.endFill();
  root.addChild(circle);

  // Initial letter inside the circle
  const letter = new PIXI.Text(uname.charAt(0).toUpperCase(), {
    fontSize: 15,
    fontFamily: 'Arial',
    fontWeight: 'bold',
    fill: 0xffffff,
  });
  letter.anchor.set(0.5);
  root.addChild(letter);

  // Username label below the avatar
  const label = new PIXI.Text(uname, {
    fontSize: 11,
    fontFamily: 'Arial',
    fill: isLocal ? 0xffffff : 0xbbbbbb,
  });
  label.anchor.set(0.5, 0);
  label.y = PLAYER_RADIUS + 7;
  root.addChild(label);

  app.stage.addChild(root);
  return root;
}

function buildConnectionLine(app) {
  const line = new PIXI.Graphics();
  app.stage.addChildAt(line, 1); // above bg, below avatars
  return line;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CosmosCanvas({ username }) {
  const mountRef = useRef(null);

  // Mutable refs (avoid re-renders on every frame)
  const appRef = useRef(null);
  const myRef = useRef(null);               // { userId, position, sprite }
  const othersRef = useRef(new Map());      // userId → { username, position, sprite }
  const linesRef = useRef(new Map());       // roomId → PIXI.Graphics line
  const connectionsRef = useRef(new Map()); // mirrors connections state — safe to read in ticker
  const keysRef = useRef(new Set());
  const lastEmitRef = useRef(0);

  // React state (drives UI only)
  const [myUserId, setMyUserId] = useState(null);
  const [connections, setConnections] = useState(new Map()); // roomId → { userId, username }
  const [chatRooms, setChatRooms] = useState(new Map());     // roomId → Message[]
  const [activeChatRoom, setActiveChatRoom] = useState(null);
  const [onlineCount, setOnlineCount] = useState(1);

  // ── Initialise PixiJS & socket ─────────────────────────────────────────────
  useEffect(() => {
    if (!mountRef.current) return;

    // ── PixiJS Application ──────────────────────────────────────────────────
    const app = new PIXI.Application({
      width: CANVAS_W,
      height: CANVAS_H,
      backgroundColor: 0x06061a,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    mountRef.current.appendChild(app.view);
    appRef.current = app;

    // Starfield
    const starLayer = new PIXI.Container();
    for (let i = 0; i < 200; i++) {
      const g = new PIXI.Graphics();
      const alpha = Math.random() * 0.55 + 0.1;
      const r = Math.random() * 1.4 + 0.3;
      g.beginFill(0xffffff, alpha);
      g.drawCircle(Math.random() * CANVAS_W, Math.random() * CANVAS_H, r);
      g.endFill();
      starLayer.addChild(g);
    }
    // Subtle nebula blobs
    for (let i = 0; i < 4; i++) {
      const blob = new PIXI.Graphics();
      const colours = [0x1e1b4b, 0x0f172a, 0x1e3a5f, 0x1a0533];
      blob.beginFill(colours[i % colours.length], 0.5);
      blob.drawEllipse(
        Math.random() * CANVAS_W,
        Math.random() * CANVAS_H,
        200 + Math.random() * 200,
        100 + Math.random() * 150
      );
      blob.endFill();
      starLayer.addChildAt(blob, 0);
    }
    app.stage.addChild(starLayer);    // index 0 – background
    app.stage.addChild(new PIXI.Container()); // index 1 – reserved for connection lines

    // ── Keyboard input ──────────────────────────────────────────────────────
    const preventKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '];
    const onKeyDown = (e) => {
      keysRef.current.add(e.key);
      if (preventKeys.includes(e.key)) e.preventDefault();
    };
    const onKeyUp = (e) => keysRef.current.delete(e.key);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // ── Game loop ───────────────────────────────────────────────────────────
    app.ticker.add(() => {
      const me = myRef.current;
      if (!me?.sprite) return;

      const k = keysRef.current;
      let { x, y } = me.position;
      let moved = false;

      if (k.has('ArrowUp')    || k.has('w') || k.has('W')) { y -= SPEED; moved = true; }
      if (k.has('ArrowDown')  || k.has('s') || k.has('S')) { y += SPEED; moved = true; }
      if (k.has('ArrowLeft')  || k.has('a') || k.has('A')) { x -= SPEED; moved = true; }
      if (k.has('ArrowRight') || k.has('d') || k.has('D')) { x += SPEED; moved = true; }

      // Keep inside canvas bounds
      x = Math.max(PLAYER_RADIUS + 5, Math.min(CANVAS_W - PLAYER_RADIUS - 5, x));
      y = Math.max(PLAYER_RADIUS + 5, Math.min(CANVAS_H - PLAYER_RADIUS - 5, y));

      if (moved) {
        me.position = { x, y };
        me.sprite.x = x;
        me.sprite.y = y;

        const now = Date.now();
        if (now - lastEmitRef.current >= EMIT_INTERVAL_MS) {
          socket.emit('user:move', { position: { x, y } });
          lastEmitRef.current = now;
        }
      }

      // Draw connection lines between local user and each connected peer
      // (use connectionsRef — safe to read inside ticker, no stale closure)
      linesRef.current.forEach((line, roomId) => {
        const conn = connectionsRef.current.get(roomId);
        if (!conn) return;
        const other = othersRef.current.get(conn.userId);
        if (!other || !me) return;

        line.clear();
        line.lineStyle(1, 0x6366f1, 0.35);
        line.moveTo(me.position.x, me.position.y);
        line.lineTo(other.position.x, other.position.y);
      });
    });

    // ── Socket setup ────────────────────────────────────────────────────────
    socket.connect();
    socket.emit('user:join', { username });

    socket.on('user:joined', ({ userId, username: uname, position }) => {
      setMyUserId(userId);
      const sprite = buildUserSprite(app, userId, uname, position, true);
      myRef.current = { userId, position, sprite };
    });

    socket.on('users:existing', (list) => {
      list.forEach(({ userId, username: uname, position }) => {
        if (othersRef.current.has(userId)) return;
        const sprite = buildUserSprite(app, userId, uname, position, false);
        othersRef.current.set(userId, { username: uname, position, sprite });
      });
      setOnlineCount(list.length + 1);
    });

    socket.on('user:new', ({ userId, username: uname, position }) => {
      if (othersRef.current.has(userId)) return;
      const sprite = buildUserSprite(app, userId, uname, position, false);
      othersRef.current.set(userId, { username: uname, position, sprite });
      setOnlineCount((n) => n + 1);
    });

    socket.on('user:moved', ({ userId, position }) => {
      const u = othersRef.current.get(userId);
      if (!u) return;
      u.position = position;
      u.sprite.x = position.x;
      u.sprite.y = position.y;
    });

    socket.on('user:left', ({ userId }) => {
      const u = othersRef.current.get(userId);
      if (u) {
        app.stage.removeChild(u.sprite);
        u.sprite.destroy({ children: true });
        othersRef.current.delete(userId);
      }
      setOnlineCount((n) => Math.max(1, n - 1));
    });

    socket.on('proximity:connect', ({ userId, username: uname, roomId }) => {
      // Add a connection line
      const line = buildConnectionLine(app);
      linesRef.current.set(roomId, line);

      setConnections((prev) => {
        const next = new Map(prev).set(roomId, { userId, username: uname });
        connectionsRef.current = next; // keep ref in sync for ticker
        return next;
      });
      setChatRooms((prev) => {
        const next = new Map(prev);
        if (!next.has(roomId)) next.set(roomId, []);
        return next;
      });
      setActiveChatRoom(roomId);
    });

    socket.on('proximity:disconnect', ({ userId, roomId }) => {
      // Remove connection line
      const line = linesRef.current.get(roomId);
      if (line) {
        app.stage.removeChild(line);
        line.destroy();
        linesRef.current.delete(roomId);
      }

      setConnections((prev) => {
        const next = new Map(prev);
        next.delete(roomId);
        connectionsRef.current = next; // keep ref in sync for ticker
        return next;
      });
      setActiveChatRoom((prev) => (prev === roomId ? null : prev));
    });

    socket.on('chat:message', ({ roomId, userId, username: uname, message, timestamp }) => {
      setChatRooms((prev) => {
        const next = new Map(prev);
        const msgs = next.get(roomId) ?? [];
        next.set(roomId, [...msgs, { userId, username: uname, message, timestamp }]);
        return next;
      });
    });

    // ── Cleanup ─────────────────────────────────────────────────────────────
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);

      ['user:joined', 'users:existing', 'user:new', 'user:moved', 'user:left',
        'proximity:connect', 'proximity:disconnect', 'chat:message'].forEach((ev) =>
        socket.off(ev)
      );

      socket.disconnect();
      app.destroy(true, { children: true });
    };
  }, []); // run once on mount

  // ── Send chat message ──────────────────────────────────────────────────────
  const sendMessage = useCallback(
    (message) => {
      if (!activeChatRoom || !message.trim()) return;
      socket.emit('chat:message', { roomId: activeChatRoom, message });
    },
    [activeChatRoom]
  );

  const activeConnection = activeChatRoom ? connections.get(activeChatRoom) : null;
  const activeMessages = activeChatRoom ? (chatRooms.get(activeChatRoom) ?? []) : [];

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-[#06061a] overflow-hidden">

      {/* Top bar */}
      <header className="flex items-center justify-between px-5 py-2.5 bg-gray-900/90 border-b border-gray-800 backdrop-blur z-10 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">🪐</span>
          <span className="text-white font-semibold text-sm">Virtual Cosmos</span>
        </div>

        <div className="flex items-center gap-5 text-xs text-gray-400">
          {connections.size > 0 ? (
            <span className="flex items-center gap-1.5 text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
              {connections.size} active connection{connections.size > 1 ? 's' : ''}
            </span>
          ) : (
            <span className="text-gray-600">No connections yet – walk closer to someone</span>
          )}
          <span className="text-gray-500">
            {onlineCount} online
          </span>
          <span className="text-white font-medium">You: {username}</span>
        </div>

        <div className="text-xs text-gray-600 bg-gray-800 px-3 py-1 rounded-full">
          WASD / ↑↓←→ to move
        </div>
      </header>

      {/* Canvas + Chat */}
      <div className="flex flex-1 overflow-hidden">

        {/* Canvas area */}
        <div className="relative flex-1 overflow-hidden">
          <div ref={mountRef} className="w-full h-full" />

          {/* Connection badges (top-left of canvas) */}
          {connections.size > 0 && (
            <div className="absolute top-4 left-4 flex flex-col gap-2">
              {[...connections.entries()].map(([roomId, conn]) => (
                <button
                  key={roomId}
                  onClick={() => setActiveChatRoom(roomId)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition shadow-lg ${
                    activeChatRoom === roomId
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-900/85 text-gray-300 hover:bg-gray-800/85 border border-gray-700'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  {conn.username}
                </button>
              ))}
            </div>
          )}

          {/* Empty state hint */}
          {onlineCount === 1 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-gray-600 text-xs text-center pointer-events-none">
              Open another browser tab to test multiplayer →{' '}
              <span className="text-gray-500">localhost:5173</span>
            </div>
          )}
        </div>

        {/* Chat panel – slides in when a connection is active */}
        {activeChatRoom && activeConnection && (
          <ChatPanel
            connection={activeConnection}
            messages={activeMessages}
            myUserId={myUserId}
            onSend={sendMessage}
            onClose={() => setActiveChatRoom(null)}
          />
        )}
      </div>
    </div>
  );
}
