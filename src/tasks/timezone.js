const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const formatterCache = new Map();

const getPartsFormatter = (timeZone) => {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
};

export const isValidTimeZone = (timeZone) => {
  if (typeof timeZone !== 'string' || !timeZone || timeZone.length > 64) return false;
  try {
    getPartsFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
};

export const isValidDateKey = (value) => {
  if (typeof value !== 'string') return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

export const isValidTime = (value) => typeof value === 'string' && TIME_PATTERN.test(value);

/** Wall-clock parts of an instant in the given IANA time zone. */
export const getZonedParts = (instant, timeZone) => {
  const parts = {};
  for (const { type, value } of getPartsFormatter(timeZone).formatToParts(instant)) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  return parts;
};

const offsetAt = (timestamp, timeZone) => {
  const p = getZonedParts(new Date(timestamp), timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(timestamp / 1000) * 1000;
};

/**
 * Converts a wall-clock date and time in `timeZone` to a UTC instant.
 * Non-existent local times (DST gap) resolve forward, ambiguous ones to the first occurrence.
 */
export const zonedTimeToUtc = (dateKey, time, timeZone) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const firstOffset = offsetAt(guess, timeZone);
  let result = guess - firstOffset;
  const secondOffset = offsetAt(result, timeZone);
  if (secondOffset !== firstOffset) result = guess - secondOffset;
  return new Date(result);
};

const pad = (value) => String(value).padStart(2, '0');

export const utcToZonedDateTime = (instant, timeZone) => {
  const p = getZonedParts(instant, timeZone);
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
};

/** Prisma returns @db.Date columns as UTC midnight. */
export const dateKeyToDb = (dateKey) => (dateKey ? new Date(`${dateKey}T00:00:00.000Z`) : null);

export const dbToDateKey = (value) => (value ? value.toISOString().slice(0, 10) : null);
