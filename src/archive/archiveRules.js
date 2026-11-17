import { isValidTimeZone, utcToZonedDateTime, zonedTimeToUtc } from '../tasks/timezone.js';

export const OVERDUE_DAYS = 30;
export const ARCHIVE_PURGE_OPTIONS = [365, 730];
export const TRASH_RETENTION_OPTIONS = [7, 30, 90];

export const safeTimeZone = (timeZone) => (isValidTimeZone(timeZone) ? timeZone : 'UTC');

export const addDaysToKey = (key, days) => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

export const archiveCutoffs = (now, timeZone) => {
  const zone = safeTimeZone(timeZone);
  const today = utcToZonedDateTime(now, zone).date;
  const monthStart = `${today.slice(0, 8)}01`;
  return {
    today,
    monthStart,
    monthStartAt: zonedTimeToUtc(monthStart, '00:00', zone),
    overdueBefore: addDaysToKey(today, -OVERDUE_DAYS),
  };
};
