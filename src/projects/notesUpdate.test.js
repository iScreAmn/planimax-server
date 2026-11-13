import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveNotesUpdate } from './notesUpdate.js';
import { NOTES_DOC_MAX_LENGTH } from './notesDocument.js';

const updatedAt = new Date('2026-11-13T10:00:00.000Z');
const serialize = (...lines) =>
  JSON.stringify({
    version: 1,
    doc: { type: 'doc', content: lines.map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] })) },
  });

const legacyProject = { notes: 'old text', notesDoc: null, notesVersion: 4, updatedAt };
const docProject = { notes: 'first\nsecond', notesDoc: serialize('first', 'second'), notesVersion: 7, updatedAt };

const rejects = (existing, input, status, code) =>
  assert.throws(
    () => resolveNotesUpdate(existing, input),
    (error) => error.status === status && error.code === code,
  );

test('saves a document and derives plain text', () => {
  const notesDoc = serialize('Plan', 'Week');
  assert.deepEqual(resolveNotesUpdate(docProject, { notesDoc, expectedNotesVersion: 7 }), {
    data: { notesDoc, notes: 'Plan\nWeek' },
    where: { notesVersion: 7 },
  });
});

test('converts a legacy note into a document', () => {
  const notesDoc = serialize('old text');
  assert.deepEqual(resolveNotesUpdate(legacyProject, { notesDoc, expectedNotesVersion: 4 }), {
    data: { notesDoc, notes: 'old text' },
    where: { notesVersion: 4 },
  });
});

test('treats a repeated document as already saved, whatever the version', () => {
  assert.equal(resolveNotesUpdate(docProject, { notesDoc: docProject.notesDoc, expectedNotesVersion: 6 }), null);
});

test('rejects a document saved against a stale version', () => {
  rejects(docProject, { notesDoc: serialize('mine'), expectedNotesVersion: 6 }, 409, 'PROJECT_NOTES_CONFLICT');
});

test('rejects invalid and oversized documents before checking the version', () => {
  rejects(docProject, { notesDoc: '{"version":1}', expectedNotesVersion: 0 }, 400, 'PROJECT_NOTES_INVALID');
  rejects(docProject, { notesDoc: 'x'.repeat(NOTES_DOC_MAX_LENGTH + 1), expectedNotesVersion: 0 }, 413, 'PROJECT_NOTES_TOO_LARGE');
});

test('keeps saving legacy text while the project has no document', () => {
  assert.deepEqual(resolveNotesUpdate(legacyProject, { notes: 'new text', expectedNotesVersion: 4 }), {
    data: { notes: 'new text' },
    where: { notesVersion: 4, notesDoc: null },
  });
  assert.deepEqual(
    resolveNotesUpdate(legacyProject, { notes: 'new text', expectedUpdatedAt: updatedAt.toISOString() }).data,
    { notes: 'new text' },
  );
  rejects(legacyProject, { notes: 'new text', expectedNotesVersion: 3 }, 409, 'PROJECT_NOTES_CONFLICT');
});

test('rejects legacy text over a document so an outdated tab cannot erase formatting', () => {
  rejects(docProject, { notes: 'plain overwrite', expectedNotesVersion: 7 }, 409, 'PROJECT_NOTES_CLIENT_OUTDATED');
});

test('ignores unchanged or missing notes', () => {
  assert.equal(resolveNotesUpdate(docProject, {}), null);
  assert.equal(resolveNotesUpdate(docProject, { notes: docProject.notes, expectedNotesVersion: 1 }), null);
  assert.equal(resolveNotesUpdate(legacyProject, { notes: 'old text', expectedNotesVersion: 1 }), null);
});
