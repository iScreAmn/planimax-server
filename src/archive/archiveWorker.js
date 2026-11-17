import { runArchive } from './archiveRepository.js';

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

export const startArchiveWorker = () => {
  const interval = Number(process.env.ARCHIVE_INTERVAL_MS) || DEFAULT_INTERVAL_MS;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const { completed, overdue, purged } = await runArchive();
      if (completed || overdue || purged) {
        console.log(`[archive] archived ${completed} completed and ${overdue} overdue tasks, purged ${purged}`);
      }
    } catch (error) {
      console.error('[archive] run failed:', error.message || error);
    } finally {
      running = false;
    }
  };

  tick();
  const timer = setInterval(tick, interval);
  timer.unref();
  return () => clearInterval(timer);
};
