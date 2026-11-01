// Entry point when the API runs on Vercel (serverless functions) instead of a normal server (src/server.js).
// Each request may start a fresh function, so the database connection is opened once and reused while the
// function stays warm. Live updates (Socket.IO) and the in-process reminder timer don't run here: the website
// checks for new notifications every few seconds instead, and Vercel Cron calls /api/internal/reminders.
import { createApp } from '../src/app.js';
import { connectDB, ensureIndexes } from '../src/config/db.js';
import { registerBookingNotifications } from '../src/services/notifications.js';
// Load every model so ensureIndexes() knows about them.
import '../src/models/SlotSeat.js';
import '../src/models/Booking.js';
import '../src/models/VehicleHealth.js';
import '../src/models/Payment.js';
import '../src/models/Notification.js';
import '../src/models/Review.js';
import '../src/models/Complaint.js';
import '../src/models/TowRequest.js';

const app = createApp();
registerBookingNotifications(); // booking events still become notifications (and emails)

let ready = null;
function connectOnce() {
  if (!process.env.JWT_SECRET) return Promise.reject(new Error('JWT_SECRET is not set in the Vercel project settings.'));
  ready ??= connectDB(process.env.MONGO_URI)
    .then(ensureIndexes)
    .catch((err) => { ready = null; throw err; }); // try again on the next request
  return ready;
}

export default async function handler(req, res) {
  try {
    await connectOnce();
  } catch (err) {
    console.error('Could not connect to the database:', err.message);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ message: 'The server is starting or cannot reach the database. Please try again in a moment.' }));
    return;
  }
  return app(req, res);
}
