import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pingDB, disconnectDB } from './src/config/prisma.js';
import projectRoutes from './src/projects/routes/projectRoutes.js';
import authRoutes from './src/auth/routes/authRoutes.js';
import userRoutes from './src/users/routes/userRoutes.js';
import taskRoutes from './src/tasks/routes/taskRoutes.js';
import syncRoutes from './src/sync/syncRoutes.js';
import { startReminderWorker } from './src/reminders/reminderWorker.js';
import { deleteExpiredTokens } from './src/auth/services/tokenService.js';

const app = express();
const PORT = Number(process.env.PORT || 5055);
const isProduction = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);

const DEV_ORIGINS = ['http://localhost:3030', 'http://127.0.0.1:3030'];
const allowedOrigins = new Set([
  ...String(process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  ...(isProduction ? [] : DEV_ORIGINS),
]);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      callback(null, allowedOrigins.has(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  }),
);

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

app.use((req, res, next) => {
  const origin = req.get('origin');
  if (!origin || SAFE_METHODS.has(req.method) || allowedOrigins.has(origin)) return next();
  return res.status(403).json({ success: false, message: 'Origin is not allowed' });
});

app.use(helmet());
app.use(cookieParser());
app.use('/api/projects', express.json({ limit: '1mb' }));
app.use(express.json({ limit: '256kb' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/sync', syncRoutes);

app.get('/api/health', async (req, res) => {
  try {
    await pingDB();
    res.json({ status: 'ok', db: 'up', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[health] БД недоступна:', error.message || error);
    res.status(503).json({ status: 'error', db: 'down' });
  }
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Invalid JSON' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' });
  }
  const status = Number(err.status || err.statusCode);
  if (status >= 400 && status < 500) {
    return res.status(status).json({ success: false, message: 'Bad request' });
  }
  console.error('Unhandled error:', err);
  return res.status(500).json({
    success: false,
    message: 'Internal server error. Please try again later.',
  });
});

const TOKEN_CLEANUP_INTERVAL_MS = 12 * 60 * 60 * 1000;

const cleanupTokens = () =>
  deleteExpiredTokens().catch((error) =>
    console.error('[auth] token cleanup failed:', error.message || error),
  );

const jwtSecret = String(process.env.JWT_SECRET || '').trim();
if (!jwtSecret && isProduction) {
  console.error('[auth] JWT_SECRET is not set: refusing to start in production');
  process.exit(1);
}
if (jwtSecret && jwtSecret.length < 32) {
  console.warn('[auth] JWT_SECRET is shorter than 32 characters: use a longer random value');
}

let stopReminderWorker = () => {};

const server = app.listen(PORT, () => {
  console.log(`Planimax API running on port ${PORT}`);
  if (!jwtSecret) {
    console.warn('[auth] JWT_SECRET is not set: sign-in will fail');
  }
  cleanupTokens();
  setInterval(cleanupTokens, TOKEN_CLEANUP_INTERVAL_MS).unref();
  stopReminderWorker = startReminderWorker();
});

const shutdown = (signal) => () => {
  console.log(`${signal} received, shutting down`);
  stopReminderWorker();
  server.close(async () => {
    await disconnectDB();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGTERM', shutdown('SIGTERM'));
process.on('SIGINT', shutdown('SIGINT'));

export default app;
