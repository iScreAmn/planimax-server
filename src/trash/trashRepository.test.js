import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRASH_RETENTION_DAYS, expiryCutoff, notePreview, purgeAt } from './trashRepository.js';

test('items are purged after the retention period', () => {
  const deletedAt = new Date('2026-11-01T10:00:00.000Z');
  assert.equal(TRASH_RETENTION_DAYS, 30);
  assert.equal(purgeAt(deletedAt).toISOString(), '2026-12-01T10:00:00.000Z');
  assert.equal(purgeAt(deletedAt, 7).toISOString(), '2026-11-08T10:00:00.000Z');
});

test('the expiry cutoff is retention days before now', () => {
  const now = new Date('2026-12-01T10:00:00.000Z');
  assert.equal(expiryCutoff(now).toISOString(), '2026-11-01T10:00:00.000Z');
  const deletedAt = new Date('2026-11-01T09:59:59.000Z');
  assert.ok(deletedAt < expiryCutoff(now));
});

test('note preview collapses whitespace and is limited', () => {
  assert.equal(notePreview('  first line\n\nsecond   line  '), 'first line second line');
  assert.equal(notePreview('x'.repeat(500)).length, 160);
  assert.equal(notePreview(''), '');
});
