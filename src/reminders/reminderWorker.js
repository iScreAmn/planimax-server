import { prisma } from '../config/prisma.js';
import { dbToDateKey, zonedTimeToUtc } from '../tasks/timezone.js';
import { TelegramError, escapeHtml, getTelegramConfig, sendTopicMessage } from './telegramClient.js';

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 5;
/** A claim older than this means the process died mid-send; the reminder is retried. */
const STALE_CLAIM_MS = 5 * 60 * 1000;
const BACKOFF_MS = [30_000, 2 * 60_000, 10 * 60_000, 30 * 60_000];
const ERROR_MAX_LENGTH = 500;

const log = (...args) => console.log('[reminders]', ...args);
const logError = (...args) => console.error('[reminders]', ...args);

const formatMoment = (instant, timeZone, withTime = true) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {}),
  }).format(instant);

export const buildReminderText = (task) => {
  const timeZone = task.reminderTimezone || 'UTC';
  const lines = [`⏰ <b>${escapeHtml(task.title)}</b>`];

  const dateKey = dbToDateKey(task.date);
  if (dateKey) {
    const instant = zonedTimeToUtc(dateKey, task.time || '12:00', timeZone);
    lines.push(`📅 ${escapeHtml(formatMoment(instant, timeZone, Boolean(task.time)))}`);
  } else {
    lines.push(`📅 ${escapeHtml(formatMoment(task.reminderAt, timeZone))}`);
  }
  if (task.project?.name) lines.push(`📁 ${escapeHtml(task.project.name)}`);
  lines.push(`<i>${escapeHtml(timeZone)}</i>`);
  return lines.join('\n');
};

const releaseStaleClaims = async (now) => {
  const { count } = await prisma.task.updateMany({
    where: { reminderStatus: 'sending', reminderClaimedAt: { lt: new Date(now.getTime() - STALE_CLAIM_MS) } },
    data: { reminderStatus: 'scheduled', reminderClaimedAt: null, reminderNextAttemptAt: now },
  });
  if (count) log(`released ${count} stale claim(s)`);
};

/** Atomically moves a due reminder to `sending`; returns false if another worker or an edit won. */
const claim = async (task, now) => {
  const { count } = await prisma.task.updateMany({
    where: {
      id: task.id,
      reminderStatus: 'scheduled',
      reminderNextAttemptAt: task.reminderNextAttemptAt,
      status: 'todo',
    },
    data: { reminderStatus: 'sending', reminderClaimedAt: now },
  });
  return count === 1;
};

/** Writes the result only if the reminder was not edited, re-scheduled or deleted meanwhile. */
const finish = (task, claimedAt, data) =>
  prisma.task.updateMany({
    where: { id: task.id, reminderStatus: 'sending', reminderClaimedAt: claimedAt },
    data,
  });

const deliver = async (config, task, now) => {
  if (!(await claim(task, now))) return;
  const attempt = task.reminderAttempts + 1;

  try {
    const result = await sendTopicMessage(config, buildReminderText(task));
    await finish(task, now, {
      reminderStatus: 'sent',
      reminderSentAt: new Date(),
      reminderAttempts: attempt,
      reminderLastError: null,
      reminderNextAttemptAt: null,
      reminderClaimedAt: null,
    });
    log(`sent task=${task.id} message=${result?.message_id ?? '?'} attempt=${attempt}`);
  } catch (error) {
    const message = String(error.message || error).slice(0, ERROR_MAX_LENGTH);
    const retryable = !(error instanceof TelegramError) || error.retryable;
    const willRetry = retryable && attempt < MAX_ATTEMPTS;
    const delay = Math.max(error.retryAfterMs ?? 0, BACKOFF_MS[attempt - 1] ?? BACKOFF_MS.at(-1));

    await finish(task, now, {
      reminderStatus: willRetry ? 'scheduled' : 'failed',
      reminderAttempts: attempt,
      reminderLastError: message,
      reminderNextAttemptAt: willRetry ? new Date(Date.now() + delay) : null,
      reminderClaimedAt: null,
    });
    logError(
      `failed task=${task.id} attempt=${attempt}/${MAX_ATTEMPTS}: ${message}` +
        (willRetry ? ` — retry in ${Math.round(delay / 1000)}s` : ' — giving up'),
    );
  }
};

export const processDueReminders = async (config = getTelegramConfig(), now = new Date()) => {
  await releaseStaleClaims(now);
  const due = await prisma.task.findMany({
    where: { reminderStatus: 'scheduled', reminderNextAttemptAt: { lte: now }, status: 'todo' },
    include: { project: { select: { name: true } } },
    orderBy: { reminderNextAttemptAt: 'asc' },
    take: BATCH_SIZE,
  });
  for (const task of due) {
    await deliver(config, task, now);
  }
  return due.length;
};

export const startReminderWorker = () => {
  const config = getTelegramConfig();
  if (!config.isConfigured) {
    console.warn(
      `[reminders] Telegram is not configured (missing ${config.missing.join(', ')}): reminders stay scheduled and are not sent`,
    );
    return () => {};
  }

  const interval = Number(process.env.REMINDER_POLL_INTERVAL_MS) || DEFAULT_POLL_INTERVAL_MS;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await processDueReminders(config);
    } catch (error) {
      logError('tick failed:', error.message || error);
    } finally {
      running = false;
    }
  };

  log(`worker started, polling every ${Math.round(interval / 1000)}s, topic ${config.topicId}`);
  tick();
  const timer = setInterval(tick, interval);
  timer.unref();
  return () => clearInterval(timer);
};
