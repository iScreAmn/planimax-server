import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDaysToKey, archiveCutoffs, safeTimeZone } from './archiveRules.js';

test('cutoffs follow the calendar month in the user time zone', () => {
  const cutoffs = archiveCutoffs(new Date('2026-12-01T10:00:00.000Z'), 'Europe/Moscow');
  assert.equal(cutoffs.today, '2026-12-01');
  assert.equal(cutoffs.monthStart, '2026-12-01');
  assert.equal(cutoffs.monthStartAt.toISOString(), '2026-11-30T21:00:00.000Z');
  assert.equal(cutoffs.overdueBefore, '2026-11-01');
});

test('late evening in UTC is already the next month further east', () => {
  const now = new Date('2026-11-30T22:30:00.000Z');
  assert.equal(archiveCutoffs(now, 'UTC').monthStart, '2026-11-01');
  assert.equal(archiveCutoffs(now, 'Asia/Tbilisi').monthStart, '2026-12-01');
});

test('overdue cutoff is thirty days before today', () => {
  assert.equal(archiveCutoffs(new Date('2026-11-17T12:00:00.000Z'), 'UTC').overdueBefore, '2026-10-18');
  assert.equal(addDaysToKey('2026-03-01', -1), '2026-02-28');
});

test('unknown time zones fall back to UTC', () => {
  assert.equal(safeTimeZone('Mars/Base'), 'UTC');
  assert.equal(safeTimeZone(undefined), 'UTC');
  assert.equal(safeTimeZone('Europe/Moscow'), 'Europe/Moscow');
});
