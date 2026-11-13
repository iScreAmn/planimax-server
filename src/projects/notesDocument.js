export const NOTES_DOC_VERSION = 1;
export const NOTES_DOC_MAX_LENGTH = 200_000;
export const NOTES_TEXT_MAX_LENGTH = 50_000;
export const NOTES_DOC_MAX_DEPTH = 40;
export const NOTES_DOC_MAX_NODES = 8_000;

export const TEXT_COLORS = Object.freeze([
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red',
]);
export const TEXT_ALIGNS = Object.freeze(['left', 'center', 'right']);

const TEXTBLOCKS = new Set(['paragraph', 'heading', 'detailsSummary']);

const inlineText = (node) =>
  (node.content ?? []).map((child) => (child.type === 'hardBreak' ? '\n' : (child.text ?? ''))).join('');

export const extractNotesText = (doc) => {
  const lines = [];
  const walk = (node) => {
    if (TEXTBLOCKS.has(node.type)) {
      lines.push(inlineText(node));
      return;
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
  return lines.join('\n');
};

class NotesDocError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const invalid = (message) => new NotesDocError('INVALID', message);
const tooLarge = (message) => new NotesDocError('TOO_LARGE', message);

const isPlainObject = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const absent = (value) => value === undefined || value === null;
const optional = (check) => (value) => absent(value) || check(value);
const oneOf = (values) => (value) => values.includes(value);
const align = optional(oneOf(TEXT_ALIGNS));

const BLOCKS = ['paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'details'];
const INLINE = ['text', 'hardBreak'];

const NODES = {
  doc: { content: { rest: BLOCKS, min: 1 } },
  paragraph: { attrs: { textAlign: align }, content: { rest: INLINE } },
  heading: { attrs: { level: oneOf([1, 2]), textAlign: align }, content: { rest: INLINE } },
  bulletList: { content: { rest: ['listItem'], min: 1 } },
  orderedList: {
    attrs: { start: optional((value) => Number.isInteger(value) && value >= 1 && value <= 99_999), type: absent },
    content: { rest: ['listItem'], min: 1 },
  },
  listItem: { content: { first: ['paragraph'], rest: BLOCKS, min: 1 } },
  taskList: { content: { rest: ['taskItem'], min: 1 } },
  taskItem: {
    attrs: { checked: (value) => typeof value === 'boolean' },
    content: { first: ['paragraph'], rest: BLOCKS, min: 1 },
  },
  details: { content: { sequence: ['detailsSummary', 'detailsContent'] } },
  detailsSummary: { content: { rest: INLINE } },
  detailsContent: { content: { rest: BLOCKS, min: 1 } },
  hardBreak: {},
  text: {},
};

const MARKS = {
  bold: {},
  italic: {},
  strike: {},
  textColor: { attrs: { color: oneOf(TEXT_COLORS) } },
};

const NODE_KEYS = new Set(['type', 'attrs', 'content']);
const TEXT_KEYS = new Set(['type', 'text', 'marks']);
const MARK_KEYS = new Set(['type', 'attrs']);

const checkKeys = (value, allowed, where) => {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw invalid(`Unexpected field "${key}" in ${where}`);
  }
};

const checkAttrs = (attrs, spec = {}, where) => {
  if (attrs !== undefined && !isPlainObject(attrs)) throw invalid(`Attributes of ${where} must be an object`);
  for (const key of Object.keys(attrs ?? {})) {
    if (!Object.hasOwn(spec, key)) throw invalid(`Unexpected attribute "${key}" in ${where}`);
  }
  for (const [key, check] of Object.entries(spec)) {
    if (!check(attrs?.[key])) throw invalid(`Invalid attribute "${key}" in ${where}`);
  }
};

const checkMarks = (marks) => {
  if (marks === undefined) return;
  if (!Array.isArray(marks)) throw invalid('Marks must be an array');
  const seen = new Set();
  for (const mark of marks) {
    if (!isPlainObject(mark)) throw invalid('Mark must be an object');
    checkKeys(mark, MARK_KEYS, 'mark');
    if (typeof mark.type !== 'string' || !Object.hasOwn(MARKS, mark.type)) throw invalid('Unknown mark type');
    if (seen.has(mark.type)) throw invalid(`Duplicate mark "${mark.type}"`);
    seen.add(mark.type);
    checkAttrs(mark.attrs, MARKS[mark.type].attrs, `mark "${mark.type}"`);
  }
};

const checkContent = (node, spec, depth, state) => {
  if (!spec) {
    if (node.content !== undefined) throw invalid(`Node "${node.type}" cannot have content`);
    return;
  }
  const content = node.content ?? [];
  if (!Array.isArray(content)) throw invalid(`Content of "${node.type}" must be an array`);
  if (spec.sequence && content.length !== spec.sequence.length) {
    throw invalid(`Node "${node.type}" has invalid content`);
  }
  if (content.length < (spec.min ?? 0)) throw invalid(`Node "${node.type}" cannot be empty`);
  content.forEach((child, index) => {
    const allowed = spec.sequence ? [spec.sequence[index]] : index === 0 && spec.first ? spec.first : spec.rest;
    if (!isPlainObject(child) || !allowed.includes(child.type)) {
      throw invalid(`Node "${node.type}" has invalid content`);
    }
    checkNode(child, depth + 1, state);
  });
};

const checkNode = (node, depth, state) => {
  state.nodes += 1;
  if (state.nodes > NOTES_DOC_MAX_NODES) throw tooLarge('The note has too many blocks');
  if (depth > NOTES_DOC_MAX_DEPTH) throw invalid('The note is nested too deeply');

  if (node.type === 'text') {
    checkKeys(node, TEXT_KEYS, 'text');
    if (typeof node.text !== 'string' || node.text.length === 0) throw invalid('Text must be a non-empty string');
    checkMarks(node.marks);
    return;
  }

  const spec = NODES[node.type];
  checkKeys(node, NODE_KEYS, `node "${node.type}"`);
  checkAttrs(node.attrs, spec.attrs, `node "${node.type}"`);
  checkContent(node, spec.content, depth, state);
};

export const parseNotesDoc = (raw) => {
  try {
    if (typeof raw !== 'string') throw invalid('The note must be a string');
    if (raw.length > NOTES_DOC_MAX_LENGTH) throw tooLarge('The note is too large');

    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      throw invalid('The note is not valid JSON');
    }
    if (!isPlainObject(value)) throw invalid('The note must be an object');
    checkKeys(value, new Set(['version', 'doc']), 'note');
    if (value.version !== NOTES_DOC_VERSION) throw invalid('Unsupported note format version');
    if (!isPlainObject(value.doc) || value.doc.type !== 'doc') throw invalid('The note must contain a document');

    checkNode(value.doc, 1, { nodes: 0 });
    const text = extractNotesText(value.doc);
    if (text.length > NOTES_TEXT_MAX_LENGTH) throw tooLarge('The note text is too long');
    return { ok: true, doc: value.doc, text };
  } catch (error) {
    if (!(error instanceof NotesDocError)) throw error;
    return { ok: false, code: error.code, message: error.message };
  }
};
