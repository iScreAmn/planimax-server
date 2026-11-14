import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTES_DOC_MAX_DEPTH,
  NOTES_DOC_MAX_LENGTH,
  NOTES_DOC_MAX_NODES,
  NOTES_TEXT_MAX_LENGTH,
  extractNotesText,
  parseNotesDoc,
} from './notesDocument.js';

const text = (value, marks) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) });
const paragraph = (...content) => ({ type: 'paragraph', ...(content.length ? { content } : {}) });
const doc = (...content) => ({ type: 'doc', content });
const serialize = (root) => JSON.stringify({ version: 1, doc: root });

const fullDoc = doc(
  { type: 'heading', attrs: { level: 1, textAlign: null }, content: [text('Plan')] },
  { type: 'heading', attrs: { level: 2, textAlign: 'center' }, content: [text('Week')] },
  {
    type: 'paragraph',
    attrs: { textAlign: 'right' },
    content: [
      text('Bold', [{ type: 'bold' }, { type: 'code' }]),
      text(' and ', [{ type: 'link', attrs: { href: 'https://example.com/a?b=1' } }]),
      text('red', [{ type: 'italic' }, { type: 'textColor', attrs: { color: 'red' } }]),
      { type: 'hardBreak' },
      text('next line', [{ type: 'strike' }]),
    ],
  },
  paragraph(),
  { type: 'horizontalRule' },
  {
    type: 'bulletList',
    content: [
      {
        type: 'listItem',
        content: [paragraph(text('One')), { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph(text('Nested'))] }] }],
      },
    ],
  },
  { type: 'orderedList', attrs: { start: 3, type: null }, content: [{ type: 'listItem', content: [paragraph(text('Third'))] }] },
  {
    type: 'taskList',
    content: [
      { type: 'taskItem', attrs: { checked: true }, content: [paragraph(text('Done'))] },
      { type: 'taskItem', attrs: { checked: false }, content: [paragraph(text('Todo'))] },
    ],
  },
  {
    type: 'details',
    content: [
      { type: 'detailsSummary', content: [text('Toggle')] },
      {
        type: 'detailsContent',
        content: [
          paragraph(text('Hidden')),
          { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [paragraph(text('Inside'))] }] },
        ],
      },
    ],
  },
);

const fullText = [
  'Plan',
  'Week',
  'Bold and red\nnext line',
  '',
  'One',
  'Nested',
  'Third',
  'Done',
  'Todo',
  'Toggle',
  'Hidden',
  'Inside',
].join('\n');

const expectError = (root, code = 'INVALID', message) => {
  const result = parseNotesDoc(serialize(root));
  assert.equal(result.ok, false, `expected ${code}, got ok`);
  assert.equal(result.code, code);
  if (message) assert.equal(result.message, message);
};

test('accepts an empty document', () => {
  const result = parseNotesDoc(serialize(doc(paragraph())));
  assert.deepEqual(result, { ok: true, doc: doc(paragraph()), text: '' });
});

test('accepts every supported block and mark and extracts text', () => {
  const result = parseNotesDoc(serialize(fullDoc));
  assert.equal(result.ok, true);
  assert.equal(result.text, fullText);
});

test('extracts text without validation', () => {
  assert.equal(extractNotesText(fullDoc), fullText);
  assert.equal(extractNotesText(doc(paragraph(text('a')), paragraph(), paragraph(text('b')))), 'a\n\nb');
});

test('rejects malformed envelopes', () => {
  for (const raw of [undefined, 42, '', 'not json', 'null', '[]', '{"version":1}', JSON.stringify({ version: 2, doc: doc(paragraph()) })]) {
    const result = parseNotesDoc(raw);
    assert.equal(result.ok, false, `accepted ${String(raw)}`);
    assert.equal(result.code, 'INVALID');
  }
  const extra = JSON.stringify({ version: 1, doc: doc(paragraph()), html: '<b>x</b>' });
  assert.equal(parseNotesDoc(extra).ok, false);
});

test('rejects unknown nodes, fields and attributes', () => {
  expectError(doc());
  expectError({ type: 'paragraph' });
  expectError(doc({ type: 'image', attrs: { src: 'https://example.com/a.png' } }));
  expectError(doc({ type: 'paragraph', html: '<script>' }));
  expectError(doc({ type: 'paragraph', attrs: { style: 'color: red' } }));
  expectError(doc({ type: 'paragraph', marks: [{ type: 'bold' }] }));
  expectError(doc(paragraph(text(''))));
  expectError(doc(paragraph({ type: 'text', text: 'a', attrs: {} })));
  expectError(doc(paragraph({ type: 'hardBreak', content: [] })));
  expectError(doc({ type: 'horizontalRule', content: [paragraph()] }));
  expectError(doc({ type: 'horizontalRule', attrs: { style: 'x' } }));
  expectError(doc(paragraph({ type: 'horizontalRule' })));
  expectError(doc(paragraph({ type: 'linkMention' })));
  expectError(doc(paragraph({ type: 'linkMention', attrs: { href: 'javascript:alert(1)' } })));
  expectError(doc(paragraph({ type: 'linkMention', attrs: { href: 'https://example.com', image: 'data:image/png;base64,AA' } })));
  expectError(doc(paragraph({ type: 'linkMention', attrs: { href: 'https://example.com', icon: '/favicon.ico' } })));
  expectError(doc(paragraph({ type: 'linkMention', attrs: { href: 'https://example.com', title: 't'.repeat(301) } })));
  expectError(doc(paragraph({ type: 'linkMention', attrs: { href: 'https://example.com', onclick: 'x' } })));
  expectError(doc(paragraph({ type: 'linkMention', attrs: { href: 'https://example.com' }, content: [text('x')] })));
  expectError(doc({ type: 'details', content: [
    { type: 'detailsSummary', content: [{ type: 'linkMention', attrs: { href: 'https://example.com' } }] },
    { type: 'detailsContent', content: [paragraph()] },
  ] }));
  expectError(JSON.parse('{"type":"doc","content":[{"type":"paragraph","__proto__":{"x":1}}]}'));
});

test('rejects invalid attribute values', () => {
  expectError(doc({ type: 'heading', attrs: { level: 3 }, content: [text('H3')] }));
  expectError(doc({ type: 'heading', content: [text('No level')] }));
  expectError(doc({ type: 'paragraph', attrs: { textAlign: 'justify' } }));
  expectError(doc({ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: 'true' }, content: [paragraph()] }] }));
  expectError(doc({ type: 'orderedList', attrs: { start: 0 }, content: [{ type: 'listItem', content: [paragraph()] }] }));
  expectError(doc({ type: 'orderedList', attrs: { type: 'a' }, content: [{ type: 'listItem', content: [paragraph()] }] }));
});

test('rejects marks outside the allowed set', () => {
  expectError(doc(paragraph(text('x', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]))));
  expectError(doc(paragraph(text('x', [{ type: 'link' }]))));
  expectError(doc(paragraph(text('x', [{ type: 'link', attrs: { href: 'example.com' } }]))));
  expectError(doc(paragraph(text('x', [{ type: 'link', attrs: { href: 'https://example.com/ onclick' } }]))));
  expectError(doc(paragraph(text('x', [{ type: 'link', attrs: { href: 'https://example.com', target: '_self' } }]))));
  expectError(doc(paragraph(text('x', [{ type: 'link', attrs: { href: `https://example.com/${'a'.repeat(2048)}` } }]))));
  expectError(doc(paragraph(text('x', [{ type: 'textColor', attrs: { color: '#ff0000' } }]))));
  expectError(doc(paragraph(text('x', [{ type: 'textColor', attrs: { color: 'red;background:url(x)' } }]))));
  expectError(doc(paragraph(text('x', [{ type: 'textColor' }]))));
  expectError(doc(paragraph(text('x', [{ type: 'bold' }, { type: 'bold' }]))));
  expectError(doc(paragraph(text('x', [{ type: 'code', attrs: { language: 'js' } }]))));
  expectError(doc(paragraph(text('x', [{ type: 'bold', attrs: { weight: 900 } }]))));
});

test('rejects invalid structure', () => {
  expectError(doc({ type: 'bulletList', content: [] }));
  expectError(doc({ type: 'bulletList', content: [paragraph(text('x'))] }));
  expectError(doc({ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'heading', attrs: { level: 1 } }] }] }));
  expectError(doc({ type: 'details', content: [{ type: 'detailsSummary' }] }));
  expectError(doc({ type: 'details', content: [{ type: 'detailsContent', content: [paragraph()] }, { type: 'detailsSummary' }] }));
  expectError(doc({ type: 'details', content: [{ type: 'detailsSummary' }, { type: 'detailsContent', content: [] }] }));
  expectError(doc(paragraph(paragraph())));
  expectError(doc({ type: 'listItem', content: [paragraph()] }));
  expectError(doc(doc(paragraph())));
});

const nestedLists = (levels) => {
  let node = paragraph(text('deep'));
  for (let i = 0; i < levels; i += 1) node = { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph(), node] }] };
  return doc(node);
};

test('limits nesting depth', () => {
  const allowed = Math.floor((NOTES_DOC_MAX_DEPTH - 3) / 2);
  assert.equal(parseNotesDoc(serialize(nestedLists(allowed))).ok, true);
  expectError(nestedLists(allowed + 1), 'INVALID', 'The note is nested too deeply');
});

test('limits size, node count and text length', () => {
  const longRaw = serialize(doc(paragraph(text('x'.repeat(NOTES_DOC_MAX_LENGTH)))));
  assert.deepEqual(parseNotesDoc(longRaw), { ok: false, code: 'TOO_LARGE', message: 'The note is too large' });

  const paragraphs = (count) => doc(...Array.from({ length: count }, () => paragraph()));
  assert.ok(serialize(paragraphs(NOTES_DOC_MAX_NODES)).length < NOTES_DOC_MAX_LENGTH, 'node limit must be reachable');
  assert.equal(parseNotesDoc(serialize(paragraphs(NOTES_DOC_MAX_NODES - 1))).ok, true);
  expectError(paragraphs(NOTES_DOC_MAX_NODES), 'TOO_LARGE', 'The note has too many blocks');

  const longText = doc(paragraph(text('x'.repeat(NOTES_TEXT_MAX_LENGTH + 1))));
  expectError(longText, 'TOO_LARGE', 'The note text is too long');
  assert.equal(parseNotesDoc(serialize(doc(paragraph(text('x'.repeat(NOTES_TEXT_MAX_LENGTH)))))).ok, true);
});
