import { validationResult } from 'express-validator';
import { TaskError, completeArchived, planArchivedForToday } from '../tasks/taskRepository.js';
import { archiveSummary, deleteArchivedForever, listArchive } from './archiveRepository.js';

const badRequest = (res, errors) =>
  res.status(400).json({
    success: false,
    message: errors.array()[0]?.msg || 'Validation failed',
    errors: errors.array().map((e) => ({ path: e.path || e.param, msg: e.msg })),
  });

const notFound = (res) => res.status(404).json({ success: false, message: 'Archived task not found' });

const handleError = (res, label, error, message) => {
  if (error instanceof TaskError) return res.status(error.status).json({ success: false, message: error.message });
  console.error(`[archive] ${label}:`, error.message || error);
  return res.status(500).json({ success: false, message });
};

export const getArchive = async (req, res) => {
  try {
    return res.json({ success: true, data: { items: await listArchive(req.user.id) } });
  } catch (error) {
    return handleError(res, 'list failed', error, 'Failed to load Archive');
  }
};

export const getArchiveSummary = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, errors);

  const since = req.query.since ? new Date(req.query.since) : undefined;
  try {
    const summary = await archiveSummary(req.user.id, { since, noteId: req.query.noteId });
    return res.json({ success: true, data: summary });
  } catch (error) {
    return handleError(res, 'summary failed', error, 'Failed to load Archive summary');
  }
};

export const postPlanToday = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, errors);

  try {
    const task = await planArchivedForToday(req.user.id, req.params.id, req.body.today);
    if (!task) return notFound(res);
    return res.json({ success: true, data: task });
  } catch (error) {
    return handleError(res, 'plan failed', error, 'Failed to return the task');
  }
};

export const postComplete = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, errors);

  try {
    const task = await completeArchived(req.user.id, req.params.id);
    if (!task) return notFound(res);
    return res.json({ success: true, data: task });
  } catch (error) {
    return handleError(res, 'complete failed', error, 'Failed to complete the task');
  }
};

export const removeArchived = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, errors);

  try {
    const deleted = await deleteArchivedForever(req.user.id, req.params.id);
    return res.json({ success: true, data: { id: req.params.id, deleted } });
  } catch (error) {
    return handleError(res, 'delete failed', error, 'Failed to delete the task');
  }
};
