import { parseNotesDoc } from './notesDocument.js';
import { ProjectError } from './projectError.js';

export const notesConflict = () =>
  new ProjectError(409, 'Project notes changed since this version', 'PROJECT_NOTES_CONFLICT');

const outdatedClient = () =>
  new ProjectError(409, 'This note uses a newer format. Please update the app.', 'PROJECT_NOTES_CLIENT_OUTDATED');

const invalidDoc = ({ code, message }) =>
  code === 'TOO_LARGE'
    ? new ProjectError(413, message, 'PROJECT_NOTES_TOO_LARGE')
    : new ProjectError(400, message, 'PROJECT_NOTES_INVALID');

const matchesVersion = (project, { expectedNotesVersion, expectedUpdatedAt }) =>
  expectedNotesVersion !== undefined
    ? project.notesVersion === expectedNotesVersion
    : project.updatedAt.getTime() === new Date(expectedUpdatedAt).getTime();

export const resolveNotesUpdate = (existing, input) => {
  if (input.notesDoc !== undefined) {
    if (input.notesDoc === existing.notesDoc) return null;
    const parsed = parseNotesDoc(input.notesDoc);
    if (!parsed.ok) throw invalidDoc(parsed);
    if (!matchesVersion(existing, input)) throw notesConflict();
    return {
      data: { notesDoc: input.notesDoc, notes: parsed.text },
      where: { notesVersion: existing.notesVersion },
    };
  }

  if (input.notes === undefined || input.notes === existing.notes) return null;
  if (existing.notesDoc !== null) throw outdatedClient();
  if (!matchesVersion(existing, input)) throw notesConflict();
  return {
    data: { notes: input.notes },
    where: { notesVersion: existing.notesVersion, notesDoc: null },
  };
};
