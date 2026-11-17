import { purgeExpired } from './trashRepository.js';

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

export const startTrashWorker = () => {
  const interval = Number(process.env.TRASH_PURGE_INTERVAL_MS) || DEFAULT_INTERVAL_MS;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const { tasks, notes } = await purgeExpired();
      if (tasks || notes) console.log(`[trash] purged ${tasks} tasks and ${notes} notes`);
    } catch (error) {
      console.error('[trash] purge failed:', error.message || error);
    } finally {
      running = false;
    }
  };

  tick();
  const timer = setInterval(tick, interval);
  timer.unref();
  return () => clearInterval(timer);
};
