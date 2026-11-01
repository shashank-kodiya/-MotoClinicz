import { io } from 'socket.io-client';
import api, { tokenStore } from './client.js';

// One live connection to the backend (Socket.IO), opened when a page first needs it.
// It carries the login token so the server knows which center / customer to notify.
//
// When the API runs on Vercel (serverless), websockets are not available. Then a small stand-in
// checks for new notifications every 20 seconds and raises the same events the pages already listen
// to ('notification:new', 'booking:changed', 'tow:changed'), so pages still refresh by themselves.
// Set VITE_REALTIME=off (or on) to choose; by default it is off when the API is on *.vercel.app.
const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const ORIGIN = new URL(API).origin;
const REALTIME = import.meta.env.VITE_REALTIME
  ? import.meta.env.VITE_REALTIME !== 'off'
  : !/\.vercel\.app$/i.test(new URL(API).hostname);
const POLL_MS = 20000;

let socket = null;
let socketToken = null;

// The stand-in for Socket.IO used when live updates are off.
function pollingSocket() {
  const handlers = new Map();   // event -> Set of functions
  let timer = null;
  let lastSeen = null;          // newest notification time already handled

  const fire = (event, payload) => handlers.get(event)?.forEach((fn) => { try { fn(payload); } catch { /* a page's handler failed */ } });

  const check = async () => {
    if (document.hidden || !tokenStore.get()) return;
    try {
      const { data } = await api.get('/notifications', { params: { unread: true } });
      const items = [...(data.items || [])].reverse(); // oldest first
      if (lastSeen === null) { lastSeen = items.at(-1)?.createdAt || new Date(0).toISOString(); return; } // first look: just remember
      const fresh = items.filter((n) => n.createdAt > lastSeen);
      if (!fresh.length) return;
      lastSeen = fresh.at(-1).createdAt;
      for (const n of fresh) {
        fire('notification:new', { id: n._id, type: n.type, title: n.title, body: n.body, link: n.link });
        // The booking this notification is about (for pages showing one booking), then a general refresh.
        const id = (n.link || '').match(/\/(?:bookings|jobs)\/([0-9a-f]{24})/)?.[1];
        if (n.type === 'towing') fire('tow:changed', { poll: true });
        else fire('booking:changed', { poll: true, ...(id ? { id } : {}) });
      }
    } catch { /* offline or signed out: try again next time */ }
  };

  const start = () => { if (!timer) { timer = setInterval(check, POLL_MS); check(); } };
  return {
    on(event, fn) { if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event).add(fn); start(); return this; },
    off(event, fn) { handlers.get(event)?.delete(fn); return this; },
    emit() { return this; },     // e.g. slots:watch: nothing to tell the server
    disconnect() { clearInterval(timer); timer = null; handlers.clear(); }
  };
}

export function getSocket() {
  const token = tokenStore.get();
  if (socket && socketToken !== token) {
    socket.disconnect(); // logged in as someone else: reconnect with the new token
    socket = null;
  }
  if (!socket) {
    socketToken = token;
    socket = REALTIME ? io(ORIGIN, { auth: { token }, transports: ['websocket', 'polling'] }) : pollingSocket();
  }
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
  socketToken = null;
}
