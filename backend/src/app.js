import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import vehicleRoutes from './routes/vehicleRoutes.js';
import metaRoutes from './routes/metaRoutes.js';
import centerRoutes from './routes/centerRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import mapsRoutes from './routes/mapsRoutes.js';
import towingRoutes from './routes/towingRoutes.js';
import AppError, { asyncHandler } from './utils/AppError.js';
import { codesMatch } from './services/billing.js';
import { runReminders } from './services/reminders.js';
import { runPaymentReminders } from './services/paymentReminders.js';
import { nowIST } from './utils/time.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

export const allowedOrigins = () => (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((s) => s.trim());

export function createApp() {
  const app = express();
  const allowed = allowedOrigins();

  app.set('trust proxy', 1); // needed behind Render/Vercel proxies for rate limiting
  app.use(helmet());
  app.use(cors({ origin: allowed, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

  app.get('/', (req, res) => {
  res.status(200).json({
    message: 'MotoClinicz backend is running successfully',
    status: 'ok'
  });
});

  app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/vehicles', vehicleRoutes);
  app.use('/api/meta', metaRoutes);
  app.use('/api/center', centerRoutes);
  app.use('/api/bookings', bookingRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/maps', mapsRoutes);
  app.use('/api/towing', towingRoutes);

  // Phase 10: lets an outside timer run the reminders when the server sleeps between visits or runs as
  // serverless functions. Off unless CRON_SECRET is set; the secret is checked in constant time.
  //   cron-job.org etc.:  POST with header  x-cron-secret: <CRON_SECRET>
  //   Vercel Cron:        GET  with header  Authorization: Bearer <CRON_SECRET>  (Vercel adds it by itself)
  const runAllReminders = asyncHandler(async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) throw new AppError('Not found.', 404);
    const given = req.headers['x-cron-secret'] || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!codesMatch(given, secret)) throw new AppError('Not allowed.', 403);
    // Payment reminders go out only between 9 AM and 8 PM India time.
    const { minutes } = nowIST();
    const payments = minutes >= 9 * 60 && minutes < 20 * 60 ? await runPaymentReminders() : { skipped: 'outside 9 AM to 8 PM' };
    res.json({ ...(await runReminders()), payments });
  });
  app.post('/api/internal/reminders', runAllReminders);
  app.get('/api/internal/reminders', runAllReminders);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
