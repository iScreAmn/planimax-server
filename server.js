import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { pingDB, disconnectDB } from './src/config/prisma.js';
import projectRoutes from './src/projects/routes/projectRoutes.js';

dotenv.config();

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

app.use(helmet());
app.use(express.json({ limit: '256kb' }));

app.use('/api/projects', projectRoutes);

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
  console.error('Unhandled error:', err);
  return res.status(500).json({
    success: false,
    message: 'Internal server error. Please try again later.',
  });
});

const server = app.listen(PORT, () => {
  console.log(`Planimax API running on port ${PORT}`);
});

const shutdown = (signal) => () => {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await disconnectDB();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGTERM', shutdown('SIGTERM'));
process.on('SIGINT', shutdown('SIGINT'));

export default app;
