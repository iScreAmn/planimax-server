import { validationResult } from 'express-validator';
import { TaskError } from '../tasks/taskRepository.js';
import { ProjectError } from '../projects/projectRepository.js';
import { deleteForever, emptyTrash, listTrash, restoreFromTrash, retentionFor } from './trashRepository.js';

const badRequest = (res, errors) =>
  res.status(400).json({
    success: false,
    message: errors.array()[0]?.msg || 'Validation failed',
    errors: errors.array().map((e) => ({ path: e.path || e.param, msg: e.msg })),
  });

const notFound = (res, type) =>
  res.status(404).json({ success: false, message: type === 'task' ? 'Task not found' : 'Note not found' });

const handleError = (res, label, error, message) => {
  if (error instanceof TaskError || error instanceof ProjectError) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  console.error(`[trash] ${label}:`, error.message || error);
  return res.status(500).json({ success: false, message });
};

export const getTrash = async (req, res) => {
  try {
    const retentionDays = await retentionFor(req.user.id);
    const items = await listTrash(req.user.id, retentionDays);
    return res.json({ success: true, data: { retentionDays, items } });
  } catch (error) {
    return handleError(res, 'list failed', error, 'Failed to load Trash');
  }
};

export const postRestore = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, errors);

  const { type, id } = req.params;
  try {
    const restored = await restoreFromTrash(req.user.id, type, id);
    if (!restored) return notFound(res, type);
    return res.json({ success: true, data: restored });
  } catch (error) {
    return handleError(res, 'restore failed', error, 'Failed to restore');
  }
};

export const removeForever = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, errors);

  const { type, id } = req.params;
  try {
    const deleted = await deleteForever(req.user.id, type, id);
    return res.json({ success: true, data: { type, id, deleted } });
  } catch (error) {
    return handleError(res, 'delete failed', error, 'Failed to delete');
  }
};

export const removeAll = async (req, res) => {
  try {
    return res.json({ success: true, data: await emptyTrash(req.user.id) });
  } catch (error) {
    return handleError(res, 'empty failed', error, 'Failed to empty Trash');
  }
};
