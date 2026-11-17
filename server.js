import 'dotenv/config';
import app from './src/app.js';
import { disconnectDB } from './src/config/prisma.js';
import { startReminderWorker } from './src/reminders/reminderWorker.js';
import { startTrashWorker } from './src/trash/trashWorker.js';
import { startArchiveWorker } from './src/archive/archiveWorker.js';
import { deleteExpiredTokens } from './src/auth/services/tokenService.js';

const PORT = Number(process.env.PORT || 5055);
const isProduction = process.env.NODE_ENV === 'production';

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
let stopTrashWorker = () => {};
let stopArchiveWorker = () => {};

const server = app.listen(PORT, () => {
  console.log(`Planimax API running on port ${PORT}`);
  if (!jwtSecret) {
    console.warn('[auth] JWT_SECRET is not set: sign-in will fail');
  }
  cleanupTokens();
  setInterval(cleanupTokens, TOKEN_CLEANUP_INTERVAL_MS).unref();
  stopReminderWorker = startReminderWorker();
  stopTrashWorker = startTrashWorker();
  stopArchiveWorker = startArchiveWorker();
});

const shutdown = (signal) => () => {
  console.log(`${signal} received, shutting down`);
  stopReminderWorker();
  stopTrashWorker();
  stopArchiveWorker();
  server.close(async () => {
    await disconnectDB();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGTERM', shutdown('SIGTERM'));
process.on('SIGINT', shutdown('SIGINT'));

export default app;
